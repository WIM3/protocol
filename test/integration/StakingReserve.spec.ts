import { expect } from "chai";
import { BigNumber, Wallet } from "ethers";
import { waffle } from "hardhat";
import {
  AmmFake,
  API3PriceFeedMock,
  ClearingHouseFake,
  ERC20Fake,
  IfnxToken,
  InsuranceFundFake,
  Minter,
  RewardsDistributionFake,
  StakingReserveFake,
  SupplyScheduleFake,
} from "../../types";
import { deployAmm, deployErc20Fake, Side } from "../helper/contract";
import { fullDeploy } from "../helper/deploy";
import { toDecimal, toFullDigit } from "../helper/number";

describe("StakingReserve", () => {
  let addresses: Wallet[];
  let admin: Wallet;
  let staker: Wallet;
  let stakerB: Wallet;

  const vestingPeriod: BigNumber = BigNumber.from(3);
  let mintDuration: BigNumber;

  let ifnxToken: IfnxToken;
  let supplySchedule: SupplyScheduleFake;
  let stakingReserve!: StakingReserveFake;
  let rewardsDistribution!: RewardsDistributionFake;
  let quoteToken: ERC20Fake;
  let mockPriceFeed!: API3PriceFeedMock;
  let amm: AmmFake;
  let clearingHouse: ClearingHouseFake;
  let minter: Minter;
  let insuranceFund: InsuranceFundFake;

  async function forwardBlockTimestamp(time: number): Promise<void> {
    const now = await supplySchedule.mock_getCurrentTimestamp();
    const newTime = now.add(time);
    await rewardsDistribution.mock_setBlockTimestamp(newTime);
    await stakingReserve.mock_setBlockTimestamp(newTime);
    await supplySchedule.mock_setBlockTimestamp(newTime);

    // const movedBlocks = time / 15 < 1 ? 1 : time / 15;
    // const blockNumber = BigNumber.from(await amm.mock_getCurrentBlockNumber());
    // const newBlockNumber = blockNumber.add(movedBlocks);
    // await rewardsDistribution.mock_setBlockNumber(newBlockNumber);
    // await stakingReserve.mock_setBlockNumber(newBlockNumber);
    // await supplySchedule.mock_setBlockNumber(newBlockNumber);
  }

  async function endEpoch(n = 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      await forwardBlockTimestamp(mintDuration.toNumber());
      await minter.mintReward();
    }
  }

  async function forwardHalfEpoch(): Promise<void> {
    await forwardBlockTimestamp(mintDuration.div(BigNumber.from(2)).toNumber());
  }

  async function approve(account: Wallet, spender: string, amount: number | string): Promise<void> {
    await quoteToken
      .connect(account)
      .approve(spender, toFullDigit(amount, +(await quoteToken.decimals())));
  }

  async function transfer(from: Wallet, to: string, amount: number | string): Promise<void> {
    await quoteToken
      .connect(from)
      .transfer(to, toFullDigit(amount, +(await quoteToken.decimals())));
  }

  // create 5 USD fee by opening a position with 100 size
  // TODO add expected fee amount as args
  async function createFee(ammInstance: AmmFake): Promise<void> {
    await approve(stakerB, clearingHouse.address, 1000);
    await clearingHouse
      .connect(stakerB)
      .openPosition(ammInstance.address, Side.BUY, toDecimal(100), toDecimal(1), toDecimal(0));
  }

  beforeEach(async () => {
    addresses = await waffle.provider.getWallets();
    admin = addresses[0];
    staker = addresses[1];
    stakerB = addresses[3];

    const contracts = await fullDeploy({
      sender: admin.address,
      quoteTokenAmount: toFullDigit(2000000),
      ifnxRewardVestingPeriod: vestingPeriod,
      ifnxInflationRate: toFullDigit(0.01),
      tollRatio: toFullDigit(0.05),
      spreadRatio: toFullDigit(0.05),
      startSchedule: false,
    });
    amm = contracts.amm;
    quoteToken = contracts.quoteToken;
    mockPriceFeed = contracts.priceFeed;
    rewardsDistribution = contracts.rewardsDistribution;
    stakingReserve = contracts.stakingReserve;
    clearingHouse = contracts.clearingHouse;
    ifnxToken = contracts.ifnxToken;
    insuranceFund = contracts.insuranceFund;
    supplySchedule = contracts.supplySchedule;
    minter = contracts.minter;

    await forwardBlockTimestamp(0);
    mintDuration = await supplySchedule.mintDuration();

    await transfer(admin, stakerB.address, 10000);
    await transfer(admin, staker.address, 10000);
    await ifnxToken.transfer(staker.address, toFullDigit(1000));
    await ifnxToken.transfer(stakerB.address, toFullDigit(10000));

    expect(await stakingReserve.nextEpochIndex()).eq(0);
  });

  describe("depositAndStake", () => {
    it("can't stake before stakingReserve startSchedule", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(1));
      await expect(stakingReserve.connect(staker).depositAndStake(toDecimal(1))).to.be.revertedWith(
        "IFNX reward has not started"
      );
    });
  });

  describe("withdraw", () => {
    beforeEach(async () => {
      await supplySchedule.startSchedule();
    });

    it("withdraw all unlocked ifnxToken", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await stakingReserve.connect(staker).unstake(toDecimal(100));
      await endEpoch();

      await stakingReserve.connect(staker).withdraw(toDecimal(100));

      expect(await ifnxToken.balanceOf(staker.address)).eq(toFullDigit(1000));
      expect((await stakingReserve.getUnlockedBalance(staker.address)).d).eq(toFullDigit(0));
    });

    it("failed when withdrawing more than what she deposited", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await stakingReserve.connect(staker).unstake(toDecimal(100));
      await endEpoch();

      const error = "Not enough balance";
      await expect(stakingReserve.connect(staker).withdraw(toDecimal(101))).to.be.revertedWith(
        error
      );
    });
  });

  describe("stake and unstake", async () => {
    beforeEach(async () => {
      await supplySchedule.startSchedule();
    });

    it("failed when stake without approving", async () => {
      await expect(stakingReserve.connect(staker).depositAndStake(toDecimal(1))).to.be.revertedWith(
        "DecimalERC20: transferFrom failed"
      );
    });

    it("can't withdraw right after stake", async () => {
      // deposit, unstake part of the balance, withdraw more than unlock
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await stakingReserve.connect(staker).unstake(toDecimal(95));

      const error = "Not enough balance";
      await expect(stakingReserve.connect(staker).withdraw(toDecimal(10))).to.be.revertedWith(
        error
      );
      expect(await ifnxToken.balanceOf(staker.address)).eq(toFullDigit(900));
    });

    it("failed when stake too much", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

      // Stake over amount of all balance, revert and failed
      await expect(stakingReserve.connect(staker).stake(toDecimal(1))).to.be.revertedWith(
        "Stake more than all balance"
      );
    });

    it("deposit 100 and stake 90 successfully ", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await stakingReserve.connect(staker).unstake(toDecimal(100));
      await endEpoch();

      await stakingReserve.connect(staker).stake(toDecimal(90));

      expect((await stakingReserve.getUnlockedBalance(staker.address)).d).eq(toFullDigit(10));
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(90)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 2)).locked.d).eq(
        toFullDigit(90)
      );
    });

    it("stake twice", async () => {
      await forwardHalfEpoch();
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(10));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(10));
      await endEpoch();

      expect((await stakingReserve.getUnlockedBalance(staker.address)).d).eq(toFullDigit(0));
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).locked.d).eq(
        toFullDigit(20)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).timeWeightedLocked.d).eq(
        toFullDigit(10)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(20)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).timeWeightedLocked.d).eq(
        toFullDigit(20)
      );
    });

    it("deposit 100, stake 100 and unstake 100", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await stakingReserve.connect(staker).unstake(toDecimal(100));

      expect((await stakingReserve.getLockedBalance(staker.address, 0)).locked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).timeWeightedLocked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(0)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).timeWeightedLocked.d).eq(
        toFullDigit(0)
      );
      expect((await stakingReserve.getUnlockedBalance(staker.address)).d).eq(toFullDigit(0));
    });

    it("get balance after unstake all", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await endEpoch();
      await stakingReserve.connect(staker).unstake(toDecimal(100));
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).locked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).timeWeightedLocked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).timeWeightedLocked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 2)).locked.d).eq(
        toFullDigit(0)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 2)).timeWeightedLocked.d).eq(
        toFullDigit(0)
      );
    });

    it("get unstakable balance after unstake all", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(1000));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(1000));
      await endEpoch();
      await stakingReserve.connect(staker).unstake(toDecimal(1000));
      expect((await stakingReserve.getUnstakableBalance(staker.address)).d).eq(toFullDigit(0));
    });

    it("failed when unstake too much", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await expect(stakingReserve.connect(staker).unstake(toDecimal(101))).to.be.revertedWith(
        "Unstake more than locked balance"
      );
    });

    it("deposit 100, stake 80 and unstake 50 successfully", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await stakingReserve.connect(staker).unstake(toDecimal(100));
      await endEpoch();

      await stakingReserve.connect(staker).stake(toDecimal(80));
      await stakingReserve.connect(staker).unstake(toDecimal(50));

      expect((await stakingReserve.getUnlockedBalance(staker.address)).d).eq(toFullDigit(20));
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(80)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 2)).locked.d).eq(
        toFullDigit(30)
      );
    });

    it("stake and unstake twice", async () => {
      await forwardHalfEpoch();
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await stakingReserve.connect(staker).unstake(toDecimal(10));
      await stakingReserve.connect(staker).unstake(toDecimal(10));

      expect((await stakingReserve.getUnlockedBalance(staker.address)).d).eq(toFullDigit(0));
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).locked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).timeWeightedLocked.d).eq(
        toFullDigit(50)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(80)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).timeWeightedLocked.d).eq(
        toFullDigit(80)
      );

      await endEpoch();

      expect((await stakingReserve.getUnlockedBalance(staker.address)).d).eq(toFullDigit(20));
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).locked.d).eq(
        toFullDigit(100)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 0)).timeWeightedLocked.d).eq(
        toFullDigit(50)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(80)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).timeWeightedLocked.d).eq(
        toFullDigit(80)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 2)).locked.d).eq(
        toFullDigit(80)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 2)).timeWeightedLocked.d).eq(
        toFullDigit(80)
      );
    });

    it("get around half of the reward if stake in the middle of the epoch", async () => {
      // forward to the epoch 0 in the beginning
      await endEpoch();
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await forwardHalfEpoch();
      await stakingReserve.connect(staker).depositAndStake(toDecimal(20));

      expect((await stakingReserve.getLockedBalance(staker.address, 1)).locked.d).eq(
        toFullDigit(20)
      );
      expect((await stakingReserve.getLockedBalance(staker.address, 1)).timeWeightedLocked.d).eq(
        toFullDigit(10)
      );
    });
  });

  describe("getTotalBalance", () => {
    beforeEach(async () => {
      await supplySchedule.startSchedule();
    });

    it("stake 10 before epoch 0", async () => {
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await forwardHalfEpoch();

      // when staker stake 10 in the middle of epoch 0
      await stakingReserve.connect(staker).depositAndStake(toDecimal(10));

      // then staker will lock 10 PERP right away, and have 5 effectiveStake in epoch 0
      const lockedBalance = await stakingReserve.getLockedBalance(staker.address, 0);
      expect(lockedBalance.timeWeightedLocked.d).eq(toFullDigit(5));
      expect(lockedBalance.locked.d).eq(toFullDigit(10));
    });

    it.skip("stake 10 epoch 0 and stake 10 in epoch 1");

    // TODO after implementing epochReward
    it.skip("earn half of stake reward if staker stake in the middle of epoch");
    it.skip("accumulate staking amount when staker staking several times during one epoch");
  });

  describe("endEpoch", () => {
    beforeEach(async () => {
      await supplySchedule.startSchedule();
    });

    it("update totalEffectiveStakeMap when stake in between epoch", async () => {
      await endEpoch();

      // epoch 0 -> 1, stake 100
      await forwardHalfEpoch();
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(100));
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      expect((await stakingReserve.getTotalEffectiveStake(1)).d).eq(toFullDigit(50));
      await endEpoch();
      expect((await stakingReserve.getTotalEffectiveStake(2)).d).eq(toFullDigit(100));
    });

    it.skip("update epochRewardHistory");
    it.skip("reset outstandingLoan");
  });

  describe("claimFeesAndVestedReward", () => {
    beforeEach(async () => {
      await supplySchedule.startSchedule();
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(1000));
    });

    it.skip("update feeEpochCursor when claiming fee");
    it.skip("update rewardEpochCursor when claiming reward after vested");
    it.skip("won't update rewardEpochCursor when claiming reward before vested");

    it("can claim fee but no reward before vested", async () => {
      const preBalance = await quoteToken.balanceOf(staker.address);
      await stakingReserve.connect(staker).depositAndStake(toDecimal(1000));
      await createFee(amm);
      await endEpoch();

      // staker will get 100% fee reward = 5
      await stakingReserve.connect(staker).claimFeesAndVestedReward();
      const postBalance = await quoteToken.balanceOf(staker.address);
      expect(postBalance.sub(preBalance)).eq(toFullDigit(5, +(await quoteToken.decimals())));
    });

    it("can't claim fee twice in 1 epoch", async () => {
      await stakingReserve.connect(staker).depositAndStake(toDecimal(1000));
      await createFee(amm);
      await endEpoch();
      await stakingReserve.connect(staker).claimFeesAndVestedReward();
      await expect(stakingReserve.connect(staker).claimFeesAndVestedReward()).to.be.revertedWith(
        "no vested reward or fee"
      );
    });

    it("can't claim vested reward twice in 1 epoch", async () => {
      await stakingReserve.setVestingPeriod(0);
      await stakingReserve.connect(staker).depositAndStake(toDecimal(1000));
      await endEpoch();
      await stakingReserve.connect(staker).claimFeesAndVestedReward();
      await expect(stakingReserve.connect(staker).claimFeesAndVestedReward()).to.be.revertedWith(
        "no vested reward or fee"
      );
    });
  });

  describe("vested reward", () => {
    beforeEach(async () => {
      await supplySchedule.startSchedule();
      await ifnxToken.connect(staker).approve(stakingReserve.address, toFullDigit(1000));
      await ifnxToken.connect(stakerB).approve(stakingReserve.address, toFullDigit(10000));

      // init effective stake is 1000
      await stakingReserve.connect(stakerB).depositAndStake(toDecimal(1000));

      await approve(stakerB, clearingHouse.address, 1000);
    });

    it("can get fee right after one epoch without lockup period", async () => {
      await endEpoch();
      await stakingReserve.connect(staker).depositAndStake(toDecimal(1000));
      await createFee(amm);
      await endEpoch();

      // fee = 5, stake = 1000/2000 = 50%, feeReward = 2.5
      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq(0);

      const feeBalance = (await stakingReserve.getFeeRevenue(staker.address))[0];
      expect(feeBalance.token).to.eq(quoteToken.address);
      expect(feeBalance.balance.d).to.eq(toFullDigit(2.5));
    });

    // vesting period is 3
    // reward of each epoch (1M * 0.01)
    // 0: 10_000
    // 1: 10_100
    // 2: 10_201
    // 3: 10_303.01
    // 4: 10_406.040...
    // 5: 10_510.100...
    // 6: 10_615.201...
    // 7: 10_721.353...

    it("get vested reward of an epoch", async () => {
      await endEpoch(3);

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

      // fee should be 200 * 5% = 10
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(200), toDecimal(1), toDecimal(0));
      // vesting period is 3
      await endEpoch(3);

      // epoch 7
      // stake at epoch 3 and vesting period is 3
      // vested reward is available at epoch 7
      // reward at epoch 3 is 10_303.01
      // reward: 100 / 1100(total effective stake) * 10_303.01 = 936.63...
      // fee reward: 100 / 1100 * 10 = 0.909...
      await endEpoch();
      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq(
        "936637272727272727272"
      );
      expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
        "909090909090909090"
      );
    });

    it("stake at middle of an epoch and get vested reward of 3 epochs", async () => {
      await endEpoch(3);
      await forwardHalfEpoch();

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      // fee should be 200 * 5% = 10
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(200), toDecimal(1), toDecimal(0));
      // vesting period is 3
      await endEpoch(3);

      // epoch 8
      // stake at epoch 3 and vesting period is 3
      // vested reward is available at epoch 7
      // reward at epoch 3 is 10_303.01
      // reward@3: (100 * 0.5) / 1050(total effective stake) * 10_303.01 = 490.61...
      // reward@4: 100 / 1100(total effective stake) * 10_406.04 = 946.00...
      // reward@5: 100 / 1100(total effective stake) * 10_510.10 = 955.46...
      // fee reward: (100 * 0.5) / 1050 * 10 = 0.476...
      await endEpoch(3);

      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq(
        "2392086851173160173158"
      );
      expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
        "476190476190476190"
      );
    });

    it("get vested reward of 3 epochs", async () => {
      await endEpoch(3);

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      // fee should be 200 * 5% = 10
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(200), toDecimal(1), toDecimal(0));
      // vesting period is 3
      await endEpoch(3);

      // epoch 8
      // stake at epoch 3 and vesting period is 3
      // vested reward is available at epoch 7
      // reward at epoch 3 is 10_303.01
      // reward@3: 100 / 1100(total effective stake) * 10_303.01 = 936.63...
      // reward@4: 100 / 1100(total effective stake) * 10_406.04 = 946.00...
      // reward@5: 100 / 1100(total effective stake) * 10_510.10 = 955.46...
      // fee reward: 100 / 1100 * 10 = 0.909...
      await endEpoch(3);
      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq(
        "2838104600090909090907"
      );
      expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
        "909090909090909090"
      );
    });

    it("get zero vested reward when vesting period is not reached", async () => {
      await endEpoch(3);

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await endEpoch(3);

      // epoch6
      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq("0");
    });

    it("get zero vested reward when reward history is less than vesting period", async () => {
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      await endEpoch(2);

      // epoch3
      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq("0");
    });

    it("get vested reward with variant total effective staking", async () => {
      await endEpoch(3);

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));
      // fee should be 200 * 5% = 10
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(200), toDecimal(1), toDecimal(0));
      await endEpoch();

      await stakingReserve.connect(stakerB).depositAndStake(toDecimal(100));
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(100), toDecimal(1), toDecimal(0));
      await endEpoch();

      await stakingReserve.connect(stakerB).unstake(toDecimal(600));
      await endEpoch();

      // epoch 7, reward should not have any effect at epoch 7
      await endEpoch();

      // epoch 8
      // reward at epoch 4 is 10_406.04
      // reward@4 : 100 / 1200(total effective stake) * 10_406.06 = 867.171...
      // fee reward@3: 100 / 1100 * 10 = 0.909...
      // fee reward@4: 100 / 1200 * 5 = 0.416...
      await endEpoch();
      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq(
        "1803807281060606060605"
      );
      expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
        "1325757575757575755"
      );

      // epoch 10
      // reward at epoch 5 is 10_510.10
      // reward at epoch 6 is 10_615.20
      // reward@5 : 100 / 1200(total effective stake) * 10_510.10 = 875.841...
      // reward@6 : 100 / 600(total effective stake) * 10_615.20 = 1769.2
      // fee reward is the same
      await endEpoch(2);
      expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq(
        "4448849240478939393937"
      );
      expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
        "1325757575757575755"
      );
    });

    it("withdraw vested reward of an epoch", async () => {
      await endEpoch(3);

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

      // fee should be 200 * 5% = 10
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(200), toDecimal(1), toDecimal(0));

      // vesting period is 3
      await endEpoch(3);

      // epoch 7
      // stake at epoch 3 and vesting period is 3
      // vested reward is available at epoch 7
      // reward at epoch 3 is 10_303.01
      // reward: 100 / 1100(total effective stake) * 10_303.01 = 936.63...
      // fee reward: 100 / 1100 * 10 = 0.909...
      await endEpoch();

      const receipt = await stakingReserve.connect(staker).claimFeesAndVestedReward();
      await expect(receipt)
        .to.emit(stakingReserve, "RewardWithdrawn")
        .withArgs(staker.address, "936637272727272727272");

      // 1000 - 100(stake) + 936.63(reward) = 1836.63
      expect(await ifnxToken.balanceOf(staker.address)).to.eq("1836637272727272727272");
      // 10,000 + 0.9090...
      expect(await quoteToken.balanceOf(staker.address)).to.eq("10000909090");
      // balance[2] is lastRealizedLossEpochIndex
      const balance = await stakingReserve.stakeBalanceMap(staker.address);
      expect(balance[2]).to.eq(4);
    });

    it("withdraw vested reward and then withdraw after 3 epochs", async () => {
      await endEpoch(3);

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

      // fee should be 200 * 5% = 10
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(200), toDecimal(1), toDecimal(0));

      // vesting period is 3
      await endEpoch(3);

      // epoch 7
      // stake at epoch 3 and vesting period is 3
      // vested reward is available at epoch 7
      // reward at epoch 3 is 10_303.01
      // reward: 100 / 1100(total effective stake) * 10_303.01 = 936.63...
      // fee reward: 100 / 1100 * 10 = 0.909...
      await endEpoch();
      await stakingReserve.connect(staker).claimFeesAndVestedReward();

      // epoch 8~10
      // reward@4: 100 / 1100(total effective stake) * 10_406.04 = 946.00...
      // reward@5: 100 / 1100(total effective stake) * 10_510.10 = 955.46...
      // reward@6: 100 / 1100(total effective stake) * 10_615.20 = 965.01...
      // fee reward: 0
      await endEpoch(3);

      const receipt = await stakingReserve.connect(staker).claimFeesAndVestedReward();
      await expect(receipt)
        .to.emit(stakingReserve, "RewardWithdrawn")
        .withArgs(staker.address, "2866485646091818181816");

      // 1000 - 100(stake) + 936.63(reward) = 1836.63
      // 1836.63 + 2866.48 = 4073.12
      expect(await ifnxToken.balanceOf(staker.address)).to.eq("4703122918819090909088");
      // 10,000 + 0.9090...
      expect(await quoteToken.balanceOf(staker.address)).to.eq("10000909090");
      // balance[2] is lastRealizedLossEpochIndex
      const balance = await stakingReserve.stakeBalanceMap(staker.address);
      expect(balance[2]).to.eq(7);
    });

    it("withdraw vested reward and then unstake. after a epoch, stake again and withdraw reward 2 epochs later", async () => {
      await endEpoch(3);

      // epoch 3
      await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

      // fee should be 200 * 5% = 10
      await clearingHouse
        .connect(stakerB)
        .openPosition(amm.address, Side.BUY, toDecimal(200), toDecimal(1), toDecimal(0));

      // vesting period is 3
      await endEpoch(3);

      // epoch 7
      await endEpoch();

      // now nextEpochIndex = 7
      // staker get reward from index3, the reward from index4-6 are still there,
      // then staker unstake all of her staking, but she can still get reward from index 7
      // she will still be able to claim her reward in the future when the rewards are vested
      await stakingReserve.connect(staker).claimFeesAndVestedReward();
      await stakingReserve.connect(staker).unstake(toDecimal(100));

      // epoch 8
      // reward@4: 100 / 1100(total effective stake) * 10_406.04 = 946.00...
      await endEpoch();

      await stakingReserve.connect(staker).stake(toDecimal(100));
      await endEpoch(3);
      await endEpoch();
      // epoch 12
      // reward@8: 100 / 1100(total effective stake) * 10_828.56 = 984.41...
      // fee reward: 0

      // vesting period is 3
      // reward of each epoch (1M * 0.01)
      // 0: 10_000
      // 1: 10_100
      // 2: 10_201
      // 3: 10_303.01
      // 4: 10_406.040...???
      // 5: 10_510.100...???
      // 6: 10_615.201...???
      // 7: 10_721.353...???
      // 8: 10_828.567...???
      // total rewards from epoch 4 - 8 ~= 53081
      // 100 / 1100 * 53081 ~= 4825
      // staker can claim reward from index4-7, and also index8 comes from her second stake.
      const receipt = await stakingReserve.connect(staker).claimFeesAndVestedReward();
      await expect(receipt)
        .to.emit(stakingReserve, "RewardWithdrawn")
        .withArgs(staker.address, "4825569334941900090906");
    });

    // TODO move to another file
    describe("get fee reward while having multi fee tokens", () => {
      let amm2: AmmFake;
      let quoteToken2: ERC20Fake;

      let amm3: AmmFake;
      let quoteToken3: ERC20Fake;

      let amm4: AmmFake;
      let quoteToken4: ERC20Fake;

      async function deployAmmPair(quoteToken?: ERC20Fake): Promise<any> {
        const quote = quoteToken || (await deployErc20Fake(toFullDigit(20000000), "DAI", "DAI"));
        const amm = await deployAmm({
          deployer: admin.address,
          quoteAssetTokenAddr: quote.address,
          priceFeedAddr: mockPriceFeed.address,
          fundingPeriod: BigNumber.from(86400),
          fluctuation: toFullDigit(0),
        });
        await amm.setGlobalShutdown(insuranceFund.address);
        await amm.setCounterParty(clearingHouse.address);
        await amm.setOpen(true);
        await quote.approve(insuranceFund.address, toFullDigit(100));
        return { quote, amm };
      }

      async function approve(token: ERC20Fake, amount: BigNumber): Promise<void> {
        await token.transfer(staker.address, amount);
        await token.transfer(stakerB.address, amount);
        await token.connect(stakerB).approve(clearingHouse.address, amount);
      }

      beforeEach(async () => {
        const set2 = await deployAmmPair();
        quoteToken2 = set2.quote;
        amm2 = set2.amm;

        const set3 = await deployAmmPair();
        quoteToken3 = set3.quote;
        amm3 = set3.amm;

        const set4 = await deployAmmPair();
        quoteToken4 = set4.quote;
        amm4 = set4.amm;

        await approve(quoteToken, toFullDigit(10000));
        await approve(quoteToken2, toFullDigit(10000));
        await approve(quoteToken3, toFullDigit(10000));
        await approve(quoteToken4, toFullDigit(10000));
      });

      it("2 different tokens", async () => {
        await amm2.setSpreadRatio(toDecimal(0.05));
        await amm2.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm2.address);
        await endEpoch(3);

        // epoch 3
        await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

        // fee should be 100 * 5% = 10 for both of quoteToken and quoteToken2
        await createFee(amm);
        await createFee(amm2);

        // vesting period is 3
        await endEpoch(3);

        // epoch 7
        // stake at epoch 3 and vesting period is 3
        // vested reward is available at epoch 7
        // reward at epoch 3 is 10_303.01
        // reward: 100 / 1100(total effective stake) * 10_303.01 = 936.63...
        // fee reward: 100 / 1100 * 5 = 0.454...
        await endEpoch();
        expect((await stakingReserve.getVestedReward(staker.address)).d).to.eq(
          "936637272727272727272"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
          "454545454545454545"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[1].balance.d).to.eq(
          "454545454545454545"
        );
      });

      it("token a, b in epoch i and token a, b, c in epoch i + 1 ", async () => {
        await amm2.setSpreadRatio(toDecimal(0.05));
        await amm2.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm2.address);
        await endEpoch(3);

        // epoch 3
        await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

        // fee should be 100 * 5% = 10 for both of quoteToken and quoteToken2
        await createFee(amm);
        await createFee(amm2);
        await endEpoch();

        // add quoteToken3 3
        await amm3.setSpreadRatio(toDecimal(0.05));
        await amm3.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm3.address);
        await createFee(amm);
        await createFee(amm2);
        await createFee(amm3);
        await endEpoch(3);

        // fee reward of quoteToken and quoteToken2 : 100 / 1100 * (5 + 5) = 0.909...
        // fee reward of quoteToken3 : 100 / 1100 * 5 = 0.4545...
        await endEpoch();
        expect((await stakingReserve.getFeeRevenue(staker.address)).length).to.eq(3);
        expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
          "909090909090909090"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[1].balance.d).to.eq(
          "909090909090909090"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[2].balance.d).to.eq(
          "454545454545454545"
        );
      });

      it("token a, b, c in epoch i and token b, c, d in epoch i + 1 ", async () => {
        await amm2.setSpreadRatio(toDecimal(0.05));
        await amm2.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm2.address);

        await amm3.setSpreadRatio(toDecimal(0.05));
        await amm3.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm3.address);
        await endEpoch(3);

        // epoch 3
        await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

        // fee should be 100 * 5% = 10 for both of quoteToken, quoteToken2 and quoteToken3
        await createFee(amm);
        await createFee(amm2);
        await createFee(amm3);
        await endEpoch();

        // remove quoteToken and add quoteToken4 (current tokens are 2, 3, 4)
        await insuranceFund.removeAmm(amm.address);
        await amm4.setSpreadRatio(toDecimal(0.05));
        await amm4.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm4.address);
        await createFee(amm2);
        await createFee(amm3);
        await createFee(amm4);
        await endEpoch(3);

        // fee reward of quoteToken : 100 / 1100 * 5 = 0.4545...
        // fee reward of quoteToken2 and quoteToken3 : 100 / 1100 * (5 + 5) = 0.909...
        // fee reward of quoteToken4 : 100 / 1100 * 5 = 0.4545...
        await endEpoch();
        expect((await stakingReserve.getFeeRevenue(staker.address)).length).to.eq(4);
        expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
          "454545454545454545"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[1].balance.d).to.eq(
          "909090909090909090"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[2].balance.d).to.eq(
          "909090909090909090"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[3].balance.d).to.eq(
          "454545454545454545"
        );
      });

      it("token a, b in epoch i, token b, c in epoch i + 1 and token b, c, d in epoch i + 2", async () => {
        await amm2.setSpreadRatio(toDecimal(0.05));
        await amm2.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm2.address);
        await endEpoch(3);

        // epoch 3
        await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

        // fee should be 100 * 5% = 10 for both of quoteToken, quoteToken2 and quoteToken3
        await createFee(amm);
        await createFee(amm2);
        await endEpoch();

        // remove quoteToken and add quoteToken3 (current tokens are 2, 3)
        await insuranceFund.removeAmm(amm.address);
        await amm3.setSpreadRatio(toDecimal(0.05));
        await amm3.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm3.address);
        await createFee(amm2);
        await createFee(amm3);
        await endEpoch();

        // add quoteToken4 (current tokens are 2, 3, 4)
        await amm4.setSpreadRatio(toDecimal(0.05));
        await amm4.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm4.address);
        await createFee(amm2);
        await createFee(amm3);
        await createFee(amm4);
        await endEpoch(3);

        // fee reward of quoteToken : 100 / 1100 * 5 = 0.4545...
        // fee reward of quoteToken2 : 100 / 1100 * (5 + 5 + 5) = 1.363...
        // fee reward of quoteToken3 : 100 / 1100 * (5 + 5) = 0.909...
        // fee reward of quoteToken4 : 100 / 1100 * 5 = 0.4545...
        await endEpoch();
        expect((await stakingReserve.getFeeRevenue(staker.address)).length).to.eq(4);
        expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
          "454545454545454545"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[1].balance.d).to.eq(
          "1363636363636363635"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[2].balance.d).to.eq(
          "909090909090909090"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[3].balance.d).to.eq(
          "454545454545454545"
        );
      });

      it("token a, b in epoch i, token b, c in epoch i + 1 and token b, c, a in epoch i + 2", async () => {
        await amm2.setSpreadRatio(toDecimal(0.05));
        await amm2.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm2.address);
        await endEpoch(3);

        // epoch 3
        await stakingReserve.connect(staker).depositAndStake(toDecimal(100));

        // fee should be 100 * 5% = 10 for both of quoteToken, quoteToken2 and quoteToken3
        await createFee(amm);
        await createFee(amm2);
        await endEpoch();

        // remove quoteToken and add quoteToken3 (current tokens are 2, 3)
        await insuranceFund.removeAmm(amm.address);
        await insuranceFund.addAmm(amm3.address);
        await amm3.setTollRatio(toDecimal(0.05));
        await amm3.setSpreadRatio(toDecimal(0.05));
        await createFee(amm2);
        await createFee(amm3);
        await endEpoch();

        // add quoteToken4 (current tokens are 2, 3, 1)
        await amm.setSpreadRatio(toDecimal(0.05));
        await amm.setTollRatio(toDecimal(0.05));
        await insuranceFund.addAmm(amm.address);
        await createFee(amm);
        await createFee(amm2);
        await createFee(amm3);
        await endEpoch(3);

        // fee reward of quoteToken : 100 / 1100 * (5 + 5) = 0.909...
        // fee reward of quoteToken2 : 100 / 1100 * (5 + 5 + 5) = 1.363...
        // fee reward of quoteToken3 : 100 / 1100 * (5 + 5) = 0.909...
        await endEpoch();
        expect((await stakingReserve.getFeeRevenue(staker.address)).length).to.eq(3);
        expect((await stakingReserve.getFeeRevenue(staker.address))[0].balance.d).to.eq(
          "909090909090909090"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[1].balance.d).to.eq(
          "1363636363636363635"
        );
        expect((await stakingReserve.getFeeRevenue(staker.address))[2].balance.d).to.eq(
          "909090909090909090"
        );
      });
    });
  });
});
