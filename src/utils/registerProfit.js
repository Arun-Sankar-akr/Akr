import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";

/*
 * Profit = "Diff Without Credit" from the Cash Register history:
 *   closing in-hand (cash + digital)  -  opening in-hand (cash + digital)
 * Same maths as getDifferenceWithoutCredit() in CashRegister.jsx.
 * Only CLOSED registers count (an open register shows "—" there too).
 */

const DIGITAL_KEYS = ["SBI", "UCO", "PNB_T", "PNB_M", "RAJA_TEC", "PTM"];

function digitalTotal(digital) {
  return DIGITAL_KEYS.reduce(
    (sum, key) => sum + (Number(digital?.[key]) || 0),
    0
  );
}

function hasKeys(obj) {
  return obj && Object.keys(obj).length > 0;
}

function openingInHand(register) {
  const digital = hasKeys(register.openingDigital)
    ? register.openingDigital
    : register.digitalBalances || {};

  return Number(register.openingCash || 0) + digitalTotal(digital);
}

function closingInHand(register) {
  const expected = Number(
    register.expectedCash ??
      Number(register.openingCash || 0) +
        Number(register.cashAdded || 0) -
        Number(register.cashRemoved || 0) +
        Number(register.cashSales || 0)
  );

  const cash = Number(register.closingCash ?? expected);

  const digital = hasKeys(register.closingDigital)
    ? register.closingDigital
    : register.digitalBalances || {};

  return cash + digitalTotal(digital);
}

export function getRegisterProfit(register) {
  if (!register || register.status !== "closed") return 0;

  return closingInHand(register) - openingInHand(register);
}

/** Live list of { dateKey, profit } for the signed-in attendant. */
export function useRegisterProfit(uid) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      return undefined;
    }

    const q = query(
      collection(db, "cashRegisters"),
      where("attendantId", "==", uid)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        setEntries(
          snapshot.docs
            .map((item) => item.data())
            .filter((item) => item?.dateKey)
            .map((item) => ({
              dateKey: item.dateKey,
              profit: getRegisterProfit(item),
            }))
        );
      },
      (error) => {
        console.error("Profit (cash register) load failed:", error);
        setEntries([]);
      }
    );
  }, [uid]);

  return entries;
}