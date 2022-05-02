import { expect, use } from "chai";
import { ethers } from "hardhat";
import { AmmMock, ERC20Fake, InsuranceFund } from "../../types";
import { deployErc20Fake } from "../helper/contract";
import { deployAmmMock } from "../helper/mockContract";
import { toFullDigit } from "../helper/number";

describe("InsuranceFund Unit Test", () => {
  let insuranceFund: InsuranceFund;
  let amm1!: AmmMock;
  let amm2: AmmMock;
  let amm3: AmmMock;
  let amm4: AmmMock;
  let quoteToken1: ERC20Fake;
  let quoteToken2: ERC20Fake;
  let quoteToken3: ERC20Fake;

  beforeEach(async () => {
    const InsuranceFundFactory = await ethers.getContractFactory("InsuranceFund");
    insuranceFund = (await InsuranceFundFactory.deploy()) as InsuranceFund;
    await insuranceFund.initialize();

    quoteToken1 = await deployErc20Fake(toFullDigit(0), "NAME1", "SYMBOL1");
    quoteToken2 = await deployErc20Fake(toFullDigit(0), "NAME2", "SYMBOL2");
    quoteToken3 = await deployErc20Fake(toFullDigit(0), "NAME3", "SYMBOL3");

    amm1 = await deployAmmMock();
    amm2 = await deployAmmMock();
    amm3 = await deployAmmMock();
    amm4 = await deployAmmMock();

    await amm1.mockSetQuoteAsset(quoteToken1.address);
    await amm2.mockSetQuoteAsset(quoteToken2.address);
    await amm3.mockSetQuoteAsset(quoteToken3.address);
    await amm4.mockSetQuoteAsset(quoteToken1.address);

    const amms = await insuranceFund.getAllAmms();
    expect(amms.length).eq(0);
  });

  describe("amm management", () => {
    it("addAmm", async () => {
      const receipt = await insuranceFund.addAmm(amm1.address);

      const amms = await insuranceFund.getAllAmms();
      expect(amms.length).eq(1);
      expect(amm1.address).to.eq(amms[0]);

      expect(receipt).to.emit(insuranceFund, "AmmAdded").withArgs(amm1.address);
    });

    it("force error, amm already added", async () => {
      await insuranceFund.addAmm(amm1.address);
      await expect(insuranceFund.addAmm(amm1.address)).to.revertedWith("amm already added");
    });

    it("removeAmm", async () => {
      await insuranceFund.addAmm(amm1.address);
      await insuranceFund.addAmm(amm2.address);
      const receipt = await insuranceFund.removeAmm(amm1.address);

      const amms = await insuranceFund.getAllAmms();
      expect(amm2.address).to.eq(amms[0]);
      expect(amms.length).eq(1);

      expect(receipt).to.emit(insuranceFund, "AmmRemoved").withArgs(amm1.address);
    });

    it("amms, supportedQuoteToken and ammMetadata has being removed if there's no other amm", async () => {
      await insuranceFund.addAmm(amm1.address);
      await insuranceFund.removeAmm(amm1.address);

      const amms = await insuranceFund.getAllAmms();
      expect(amms.length).eq(0);
    });

    it("force error, remove non existed amm", async () => {
      await expect(insuranceFund.removeAmm(amm1.address)).to.revertedWith("amm not existed");
    });

    it("isExistedAmm", async () => {
      await insuranceFund.addAmm(amm1.address);

      expect(await insuranceFund.isExistedAmm(amm1.address)).to.be.eq(true);
      expect(await insuranceFund.isExistedAmm(amm2.address)).to.be.eq(false);
    });

    it("getAllAmms", async () => {
      await insuranceFund.addAmm(amm1.address);
      await insuranceFund.addAmm(amm2.address);
      
      const amms = await insuranceFund.getAllAmms();

      expect(amms.length).to.be.eq(2);
      expect(amm1.address).to.be.eq(amms[0]);
      expect(amm2.address).to.be.eq(amms[1]);
    });
  });
});
