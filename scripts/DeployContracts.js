// npx hardhat run scripts/deployContracts.js --network mainnetBSC

const { ethers, network } = require("hardhat");

let vrfCoordinatorAddress, linkTokenAddress, keyHash, titanoTokenAddress, usdtTokenAddress, priceOracleAddress;
const injectorAddress = "0xa96ba42cCc8EBE8096D50347FAfaF94d2e6F372B";
async function main() {
  let accounts = await ethers.getSigners();
  switch (network.name) {
    case "localhost":
      vrfCoordinatorAddress = "0xa555fC018435bef5A13C6c6870a9d4C11DEC329C";
      linkTokenAddress = "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06";
      keyHash = "0xcaf3c3727e033261d383b315559476f48034c13b18f8cafed4d871abe5049186";
      titanoTokenAddress = "0x965f527d9159dce6288a2219db51fc6eef120dd1"; //from mainnet
      usdtTokenAddress = "0x55d398326f99059fF775485246999027B3197955"; //from mainnet
      // console.log("deploy test oracle to localhost");
      // const TestOracle = await ethers.getContractFactory("TestOracle");
      // const testOracle = await TestOracle.deploy();
      // await testOracle.deployTransaction.wait();
      // priceOracleAddress = testOracle.address;
      break;
    case "testnetBSC": //"testnetBSC"
      vrfCoordinatorAddress = "0xa555fC018435bef5A13C6c6870a9d4C11DEC329C";
      linkTokenAddress = "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06";
      keyHash = "0xcaf3c3727e033261d383b315559476f48034c13b18f8cafed4d871abe5049186";
      titanoTokenAddress = "0xe7f4c7dE85487f9367beE125bd5EF2603234B6D2";
      usdtTokenAddress = "0x55d398326f99059fF775485246999027B3197955"; //from mainnet
      console.log("deploy test oracle to testnetBSC");
      const TestOracle = await ethers.getContractFactory("TestOracle");
      const testOracle = await TestOracle.deploy();
      await testOracle.deployTransaction.wait();
      priceOracleAddress = testOracle.address;
      break;
    case "mainnetBSC":
      vrfCoordinatorAddress = "0x747973a5A2a4Ae1D3a8fDF5479f1514F65Db9C31";
      linkTokenAddress = "0x404460C6A5EdE2D891e8297795264fDe62ADBB75";
      keyHash = "0xc251acd21ec4fb7f31bb8868288bfdbaeb4fbfec2df3735ddbd4f7dc8d60103c";
      titanoTokenAddress = "0xBA96731324dE188ebC1eD87ca74544dDEbC07D7f";
      usdtTokenAddress = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
      priceOracleAddress = "0x2f48CDe4CFd0FB4f5C873291D5cf2Dc9e61f2Db0";
      break;
    default:
      console.log(`Network ${network.name} not found`);
      return;
  }
  console.log(`Deployer address: ${accounts[0].address}`, `\nStart deploying Random number generator contract first`);

  const RNG = await ethers.getContractFactory("RandomNumberGenerator");
  const rng = await RNG.deploy(vrfCoordinatorAddress, linkTokenAddress);
  await rng.deployTransaction.wait();
  const rngAddress = rng.address;
  console.log(`Random number generator contract deployed to: ${rngAddress}`);

  console.log(`Set KeyHash ${keyHash} to RNG contract`);
  let tx = await rng.setKeyHash(keyHash);
  await tx.wait();
  console.log(`keyHash ${await rng.keyHash()} was successfully added`);

  console.log("Set Chain link Fee to RNG contract");
  tx = await rng.setFee("200000000000000000");
  await tx.wait();
  console.log(`Fee set to rng contract at: ${await rng.fee()}`);

  console.log("Start deploy lottery contract");
  const Lottery = await ethers.getContractFactory("TitanoLottery");
  const lottery = await Lottery.deploy(titanoTokenAddress, usdtTokenAddress, rngAddress, priceOracleAddress);
  await lottery.deployTransaction.wait();
  const lotteryAddress = lottery.address;
  console.log(`Lottery deployed to ${lotteryAddress}`);

  console.log("Add lottery contract to RNG contract");
  await rng.setLotteryAddress(lotteryAddress);

  console.log("Setting managing addresses");
  await lottery.setManagingAddresses(
    accounts[0].address,
    accounts[0].address,
    injectorAddress,
    accounts[0].address,
    accounts[0].address
  );

  // if (network.name === "mainnetBSC") {
  //   console.log("Transfer 1 LINK to rng contract");
  //   const abi = [
  //     "function balanceOf(address owner) view returns (uint256)",
  //     "function transfer(address to, uint amount) returns (bool)",
  //   ];
  //   let tokenLinkContract = new ethers.Contract(linkTokenAddress, abi, accounts[0]);
  //   await tokenLinkContract.transfer(rngAddress, "3000000000000000000");
  // }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
