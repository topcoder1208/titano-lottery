const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers, network } = require("hardhat");

let accounts, owner, titanoToken, oracle, rng, lottery;
let bracketCalculator = [];
before(async function () {
  accounts = await ethers.getSigners();
  owner = accounts[0];
  const TITANOToken = await ethers.getContractFactory("TITANOToken");
  titanoToken = await TITANOToken.deploy();
  await titanoToken.deployed();

  const Oracle = await ethers.getContractFactory("TestOracle");
  oracle = await Oracle.deploy();
  await oracle.deployed();

  const Rng = await ethers.getContractFactory("TestRandomNumberGenerator");
  rng = await Rng.deploy();
  await rng.deployed();

  const Lottery = await ethers.getContractFactory("TitanoLottery");
  lottery = await Lottery.deploy(titanoToken.address, titanoToken.address, rng.address, oracle.address);
  await lottery.deployed();

  await lottery.setManagingAddresses(
    owner.address,
    owner.address,
    owner.address,
    accounts[1].address,
    accounts[2].address
  );
  await rng.setLotteryAddress(lottery.address);

  bracketCalculator[0] = 1;
  bracketCalculator[1] = 11;
  bracketCalculator[2] = 111;
  bracketCalculator[3] = 1111;
  bracketCalculator[4] = 11111;
  bracketCalculator[5] = 111111;
  bracketCalculator[6] = 1111111;
  bracketCalculator[7] = 11111111;
});

function getBracketsForTickets(ticketsIds, ticketsNumbers, winNumber) {
  let transfWinNumber, transfTicketsNumber;
  let winTicketsId = new Map();
  for (let i = 0; i < ticketsNumbers.length; i++) {
    transfWinNumber = 0;
    transfTicketsNumber = 0;
    for (let j = 0; j < bracketCalculator.length; j++) {
      transfWinNumber = bracketCalculator[j] + (winNumber % 10 ** (j + 1));
      transfTicketsNumber = bracketCalculator[j] + (ticketsNumbers[i] % 10 ** (j + 1));
      if (transfWinNumber === transfTicketsNumber) {
        winTicketsId.set(ticketsIds[i], j);
      } else {
        break;
      }
    }
  }
  // Map(key: ticketId, value: bracket)
  return winTicketsId;
}

function getWinningAmountForTickets(ticketsIds, ticketsNumbers, winNumber, titanoPerBracket) {
  let transfWinNumber, transfTicketsNumber;
  let winTicketsId = new Map();
  let totalAmount = 0;
  for (let i = 0; i < ticketsNumbers.length; i++) {
    transfWinNumber = 0;
    transfTicketsNumber = 0;
    for (let j = 0; j < 8; j++) {
      transfWinNumber = winNumber % 10 ** (j + 1);
      transfTicketsNumber = ticketsNumbers[i] % 10 ** (j + 1);
      if (transfWinNumber === transfTicketsNumber) {
        winTicketsId.set(ticketsIds[i], [j, titanoPerBracket[j]]);
        if (j === 7) {
          totalAmount += titanoPerBracket[j];
        }
      } else {
        if (j > 0) {
          totalAmount += titanoPerBracket[j - 1];
        }
        break;
      }
    }
  }
  // Map(key: ticketId, value: [bracket, winAmount])
  return [winTicketsId, totalAmount];
}

function getCountTicketsOnBrackets(ticketsNumbers, winningNumber, rewardsBreakdown, amountCollectedInTITANO) {
  let titanoPerBracket = [];
  let countTicketsPerBracket = [];
  let ticketsOnBrackets = new Map();
  let amountToInjectNextLottery = new BigNumber.from(0);
  ticketsOnBrackets.constructor.prototype.increment = function (key) {
    this.has(key) ? this.set(key, this.get(key) + 1) : this.set(key, 1);
  };
  for (let i = 0; i < ticketsNumbers.length; i++) {
    if (ticketsNumbers[i] < 100000000 || ticketsNumbers[i] > 199999999) {
      console.log("Wrong ticket number", ticketsNumbers[i]);
      return 0;
    }
    for (let j = 0; j < 8; j++) {
      ticketsOnBrackets.increment(bracketCalculator[j] + (ticketsNumbers[i] % 10 ** (j + 1)));
    }
  }
  let previousCount = 0;
  for (let i = 7; i >= 0; i--) {
    let transfWinningNumber = bracketCalculator[i] + (winningNumber % 10 ** (i + 1));
    countTicketsPerBracket[i] = ticketsOnBrackets.get(transfWinningNumber) - previousCount || 0;

    if (countTicketsPerBracket[i] > 0) {
      if (rewardsBreakdown[i] > 0) {
        titanoPerBracket[i] = amountCollectedInTITANO
          .mul(rewardsBreakdown[i])
          .div(countTicketsPerBracket[i])
          .div(10000)
          .sub(1); // To Warn correct rounding when infinite fraction
        previousCount = ticketsOnBrackets.get(transfWinningNumber);
      }
    } else {
      titanoPerBracket[i] = 0;
      amountToInjectNextLottery = amountToInjectNextLottery.add(
        amountCollectedInTITANO.mul(rewardsBreakdown[i]).div(10000)
      );
    }
  }
  return [titanoPerBracket, countTicketsPerBracket, amountToInjectNextLottery];
}

let endTime, ticketsNumbers, burningShare, competitionAndRefShare;
let rewardsBreakdown = [360, 480, 600, 840, 1200, 1560, 1920, 3040];
let priceTicketInUSDT = BigNumber.from("1000000000000000000");
let discountDivisor = 10000;

describe("Check start new lottery", function () {
  it("Check getWinningAmountForTickets function", async function () {
    let ticketsIds, ticketsNumbers, winNumber, titanoPerBracket;
    winNumber = 178222222;
    ticketsNumbers = [178922222, 178429222, 167872222, 178211111, 178222222];
    ticketsIds = [0, 1, 2, 3, 4];
    titanoPerBracket = [10, 20, 30, 40, 50, 60, 70, 80];
    let receive = getWinningAmountForTickets(ticketsIds, ticketsNumbers, winNumber, titanoPerBracket);
  });

  it("Start new lottery", async function () {
    const timeLastBlock = (await ethers.provider.getBlock("latest")).timestamp;
    endTime = timeLastBlock + 60 * 10; // after 10 minutes
    await expect(lottery.startLottery(endTime, priceTicketInUSDT, discountDivisor, rewardsBreakdown)).to.be.emit(
      lottery,
      "LotteryOpen"
    );
    console.log("Lottery start. Current lottery id: ", (await lottery.currentLotteryId()).toString());
  });

  it("Buy tickets and check transfers amounts", async function () {
    ticketsNumbers = [134279708, 137970894, 121970142, 127160838, 127910177, 127910124];
    let currentPriceInTITANO = await lottery.getCurrentTicketPriceInTITANO(lottery.currentLotteryId());
    let balanceLotteryBefore = await titanoToken.balanceOf(lottery.address);
    let totalAmountForTickets = currentPriceInTITANO
      .mul(ticketsNumbers.length)
      .mul(discountDivisor + 1 - ticketsNumbers.length)
      .div(discountDivisor);
    await titanoToken.approve(lottery.address, totalAmountForTickets);
    await expect(lottery.buyTickets(1, ticketsNumbers)).to.be.emit(lottery, "TicketsPurchase");
    let balanceLotteryAfter = await titanoToken.balanceOf(lottery.address);
    expect(balanceLotteryAfter.sub(balanceLotteryBefore)).equal(totalAmountForTickets);
  });

  it("Check close lottery", async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await expect(lottery.closeLottery(1)).to.be.emit(lottery, "LotteryClose");
    let randomResult = await rng.viewRandomResult();
    let amountCollectedInTITANO = (await lottery.viewLottery(1)).amountCollectedInTITANO;
    burningShare = await lottery.burningShare();
    competitionAndRefShare = await lottery.competitionAndRefShare();
    let amountToDistribute = amountCollectedInTITANO.sub(
      amountCollectedInTITANO.div(10000).mul(burningShare.add(competitionAndRefShare))
    );
    let calculateBrackets = getCountTicketsOnBrackets(
      ticketsNumbers,
      randomResult,
      rewardsBreakdown,
      amountToDistribute
    );
    await expect(
      lottery.drawFinalNumberAndMakeLotteryClaimable(1, calculateBrackets[0], calculateBrackets[1], true)
    ).to.be.emit(lottery, "LotteryNumberDrawn");
    expect(amountCollectedInTITANO.div(10000).mul(burningShare.add(competitionAndRefShare))).to.equal(
      (await titanoToken.balanceOf(accounts[1].address)).add(await titanoToken.balanceOf(accounts[2].address))
    );
    let viewLottery = await lottery.viewLottery(1);

    console.log("Amount collected in TITANO", amountCollectedInTITANO);
    console.log("Amount burn referrals and competitions", amountCollectedInTITANO.sub(amountToDistribute).toString());
    console.log("Winning number: ", viewLottery.finalNumber.toString());
    console.log("Winning amount per bracket: ", viewLottery.titanoPerBracket.toString());
    console.log("Count winners per bracket: ", viewLottery.countWinnersPerBracket.toString());
    console.log("Contract balance: ", (await titanoToken.balanceOf(lottery.address)).toString());
    console.log("Injection to next lottery: ", (await lottery.pendingInjectionNextLottery()).toString());
  });

  it("Check winning number and claimed ticket", async function () {
    let viewLottery = await lottery.viewLottery(1);
    let finalNumber = viewLottery.finalNumber;
    let userInfoForLotId = await lottery.viewUserInfoForLotteryId(owner.address, 1, 0, 100);
    ticketsNumbers = userInfoForLotId[1];
    let ticketsIds = userInfoForLotId[0];
    let brackets = getBracketsForTickets(ticketsIds, ticketsNumbers, finalNumber);
    let winTicketId = Array.from(brackets.keys());
    let winBrackets = Array.from(brackets.values());
    console.log(winTicketId.toString(), winBrackets);
    await lottery.claimTickets(1, winTicketId, winBrackets);
    expect(await titanoToken.balanceOf(lottery.address)).equal(await lottery.pendingInjectionNextLottery());
  });
});

describe("Chek start new lottery and inject from previous lottery", function () {
  it("Chek start new lottery", async function () {
    const timeLastBlock = (await ethers.provider.getBlock("latest")).timestamp;
    endTime = timeLastBlock + 14400; //after 4 hours
    await expect(lottery.startLottery(endTime, priceTicketInUSDT, discountDivisor, rewardsBreakdown)).to.be.emit(
      lottery,
      "LotteryOpen"
    );
    let currentLottery = await lottery.viewLottery(await lottery.currentLotteryId());
    expect(currentLottery.amountCollectedInTITANO).equal(0);
    console.log("Lottery start. Current lottery id: ", (await lottery.currentLotteryId()).toString());
    console.log("injection on next lottery:", (await lottery.pendingInjectionNextLottery()).toString());
  });

  it("Check buy 200 tickets from 1 transaction", async function () {
    ticketsNumbers = Array.from(Array(100), () => Math.floor(Math.random() * (199999999 - 100000000 + 1)) + 100000000);
    await lottery.setMaxNumberTicketsPerBuy(200);
    let balanceLotteryBefore = await titanoToken.balanceOf(lottery.address);
    let currentPriceInTITANO = await lottery.getCurrentTicketPriceInTITANO(lottery.currentLotteryId());
    let totalAmountForTickets = lottery.calculateTotalPriceForBulkTickets(
      10000,
      currentPriceInTITANO,
      ticketsNumbers.length
    );
    await titanoToken.approve(lottery.address, totalAmountForTickets);
    await expect(lottery.buyTickets(lottery.currentLotteryId(), ticketsNumbers)).to.be.emit(lottery, "TicketsPurchase");
    let balanceLotteryAfter = await titanoToken.balanceOf(lottery.address);
    console.log(balanceLotteryBefore.toString(), balanceLotteryAfter.toString());
  });

  it("Check buy to many than approve tickets", async function () {
    await lottery.setMaxNumberTicketsPerBuy(50);
    let currentPriceInTITANO = await lottery.getCurrentTicketPriceInTITANO(lottery.currentLotteryId());
    let totalAmountForTickets = lottery.calculateTotalPriceForBulkTickets(
      10000,
      currentPriceInTITANO,
      ticketsNumbers.length
    );
    await titanoToken.approve(lottery.address, totalAmountForTickets);
    await expect(lottery.buyTickets(lottery.currentLotteryId(), ticketsNumbers)).to.be.revertedWith("Too many tickets");
  });

  it("Check Id's tickets", async function () {
    let userInfo2 = await lottery.viewUserInfoForLotteryId(accounts[0].address, 2, 0, 200);
    let userInfo1 = await lottery.viewUserInfoForLotteryId(accounts[0].address, 1, 0, 200);

    let testArrayForFirstLottery = (function (a, b, c) {
      c = [];
      while (a--) c[a] = a + b;
      return c;
    })(6, 0);
    let testArrayForSecondLottery = (function (a, b, c) {
      c = [];
      while (a--) c[a] = a + b;
      return c;
    })(100, 6);

    expect(userInfo1[0].toString()).equal(testArrayForFirstLottery.toString());
    expect(userInfo2[0].toString()).equal(testArrayForSecondLottery.toString());
  });

  it("Close lottery 2", async function () {
    await network.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
    await expect(lottery.closeLottery(2)).to.be.emit(lottery, "LotteryClose");
  });

  it("Check make lottery 2 claimable", async function () {
    let lottery_info = await lottery.viewLottery(2);
    let _amountCollectedInTITANO = lottery_info.amountCollectedInTITANO;
    let _firstTicketId = lottery_info.firstTicketId;
    let _lastTicketId = lottery_info.firstTicketIdNextLottery;
    let totalTicketsPerLottery = _lastTicketId - _firstTicketId;
    let ticketIdsForCurLottery = (function (a, b, c) {
      c = [];
      while (a--) c[a] = a + b;
      return c;
    })(totalTicketsPerLottery, _firstTicketId.toNumber());
    let ticketsNumbers = (await lottery.viewNumbersAndStatusesForTicketIds(ticketIdsForCurLottery))[0];
    let randomResult = await rng.viewRandomResult();
    let amountToDistribute = _amountCollectedInTITANO
      .sub(_amountCollectedInTITANO.div(10000).mul(burningShare.add(competitionAndRefShare)))
      .add(await lottery.pendingInjectionNextLottery());
    let calculateBrackets = getCountTicketsOnBrackets(
      ticketsNumbers,
      randomResult,
      rewardsBreakdown,
      amountToDistribute
    );
    console.log(calculateBrackets[0].toString());
    console.log(calculateBrackets[1].toString());
    console.log(calculateBrackets[2].toString());
    await expect(
      lottery.drawFinalNumberAndMakeLotteryClaimable(2, calculateBrackets[0], calculateBrackets[1], true)
    ).to.be.emit(lottery, "LotteryNumberDrawn");
  });

  it("check claim same ticket from different accounts", async function () {
    let userInfo = await lottery.viewUserInfoForLotteryId(accounts[0].address, 2, 0, 5);
  });

  //TODO chek claim same ticket 2 times,
  // check withdraw injection sum after lottery finished (avtoinjection: false),
  // check claim ticket from different accounts,
  // check change burn and competitions fee,
  // chek change price
});
