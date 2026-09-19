import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "../services/firebase";
import { useAuth } from "../context/AuthContext";

export function useTransactions(limitCount = 100) {
  const { user, profile } = useAuth();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.uid) {
      setTransactions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const isAdmin = profile?.role === "admin";

    const unsubscribeFunctions = [];
    const collectionsData = {
      transactions: [],
      moneyTransfers: [],
      withdrawals: [],
    };

    let active = true;

    // =========================================================
    // NORMALIZE + UPDATE
    // =========================================================

    const updateCombinedData = () => {
      if (!active) return;

      let combined = [
        ...collectionsData.transactions,
        ...collectionsData.moneyTransfers,
        ...collectionsData.withdrawals,
      ];

      // -------------------------------------------------------
      // SORT NEWEST FIRST
      // -------------------------------------------------------

      const getTime = (item) => {
        const value =
          item?.createdAt ||
          item?.timestamp ||
          item?.date;

        if (!value) {
          return 0;
        }

        // Firebase Timestamp
        if (typeof value.toDate === "function") {
          return value.toDate().getTime();
        }

        // JavaScript Date
        if (value instanceof Date) {
          return value.getTime();
        }

        // Number timestamp
        if (typeof value === "number") {
          return value;
        }

        // String date
        const parsed = new Date(value);

        return Number.isNaN(parsed.getTime())
          ? 0
          : parsed.getTime();
      };

      combined.sort(
        (a, b) => getTime(b) - getTime(a)
      );

      // -------------------------------------------------------
      // LIMIT
      // -------------------------------------------------------

      if (
        Number.isFinite(limitCount) &&
        limitCount > 0
      ) {
        combined = combined.slice(
          0,
          limitCount
        );
      }

      setTransactions(combined);
      setLoading(false);
    };


    // =========================================================
    // TRANSACTIONS
    // =========================================================

    let transactionsQuery;

    if (isAdmin) {
      /*
       * Admin can read all transactions.
       */
      transactionsQuery = query(
        collection(db, "transactions")
      );
    } else {
      /*
       * Attendant can only read their own transactions.
       *
       * This matches Firestore rules:
       *
       * resource.data.attendantId ==
       * request.auth.uid
       */
      transactionsQuery = query(
        collection(db, "transactions"),
        where(
          "attendantId",
          "==",
          user.uid
        )
      );
    }

    const unsubscribeTransactions =
      onSnapshot(
        transactionsQuery,
        (snapshot) => {
          collectionsData.transactions =
            snapshot.docs.map((document) => ({
              id: document.id,

              ...document.data(),

              // Common type used by dashboard
              recordType: "transaction",

              type: "Transaction",
            }));

          updateCombinedData();
        },
        (firebaseError) => {
          console.error(
            "Transactions Firestore error:",
            firebaseError
          );

          if (active) {
            setError(firebaseError);
            setTransactions([]);
            setLoading(false);
          }
        }
      );

    unsubscribeFunctions.push(
      unsubscribeTransactions
    );


    // =========================================================
    // MONEY TRANSFERS
    // =========================================================

    /*
     * Your current Firestore rules allow signed-in users
     * to read the complete moneyTransfers collection.
     *
     * Therefore we keep this query unfiltered.
     */

    const moneyTransfersQuery = query(
      collection(db, "moneyTransfers")
    );

    const unsubscribeMoneyTransfers =
      onSnapshot(
        moneyTransfersQuery,
        (snapshot) => {
          collectionsData.moneyTransfers =
            snapshot.docs.map((document) => {
              const data = document.data();

              return {
                id: document.id,

                ...data,

                // Common dashboard fields
                recordType: "moneyTransfer",

                type: "Money Transfer",

                serviceName: "Money Transfer",

                // Dashboard amount
                amount:
                  Number(
                    data.customerPays ??
                      data.transferAmount ??
                      0
                  ),

                total:
                  Number(
                    data.customerPays ??
                      data.transferAmount ??
                      0
                  ),

                // Transfer service charge as profit
                profit:
                  Number(
                    data.serviceCharge ?? 0
                  ),

                grossProfit:
                  Number(
                    data.serviceCharge ?? 0
                  ),

                status:
                  data.status ||
                  "completed",
              };
            });

          updateCombinedData();
        },
        (firebaseError) => {
          console.error(
            "Money Transfers Firestore error:",
            firebaseError
          );

          if (active) {
            setError(firebaseError);
            setLoading(false);
          }
        }
      );

    unsubscribeFunctions.push(
      unsubscribeMoneyTransfers
    );


    // =========================================================
    // WITHDRAWALS
    // =========================================================

    let withdrawalsQuery;

    if (isAdmin) {
      /*
       * Admin can read all withdrawals.
       */
      withdrawalsQuery = query(
        collection(db, "withdrawals")
      );
    } else {
      /*
       * Attendant can only read their own withdrawals.
       *
       * This matches Firestore rules.
       */
      withdrawalsQuery = query(
        collection(db, "withdrawals"),
        where(
          "attendantId",
          "==",
          user.uid
        )
      );
    }

    const unsubscribeWithdrawals =
      onSnapshot(
        withdrawalsQuery,
        (snapshot) => {
          collectionsData.withdrawals =
            snapshot.docs.map((document) => {
              const data = document.data();

              return {
                id: document.id,

                ...data,

                // Common dashboard fields
                recordType: "withdrawal",

                type: "Withdrawal",

                serviceName: "Withdrawal",

                amount:
                  Number(
                    data.customerPays ??
                      data.withdrawalAmount ??
                      0
                  ),

                total:
                  Number(
                    data.customerPays ??
                      data.withdrawalAmount ??
                      0
                  ),

                profit:
                  Number(
                    data.serviceCharge ?? 0
                  ),

                grossProfit:
                  Number(
                    data.serviceCharge ?? 0
                  ),

                status:
                  data.status ||
                  "completed",
              };
            });

          updateCombinedData();
        },
        (firebaseError) => {
          console.error(
            "Withdrawals Firestore error:",
            firebaseError
          );

          if (active) {
            setError(firebaseError);
            setLoading(false);
          }
        }
      );

    unsubscribeFunctions.push(
      unsubscribeWithdrawals
    );


    // =========================================================
    // CLEANUP
    // =========================================================

    return () => {
      active = false;

      unsubscribeFunctions.forEach(
        (unsubscribe) => {
          try {
            unsubscribe();
          } catch (error) {
            console.error(
              "Firestore unsubscribe error:",
              error
            );
          }
        }
      );
    };
  }, [
    user?.uid,
    profile?.role,
    limitCount,
  ]);


  // =========================================================
  // RETURN
  // =========================================================

  return {
    transactions,
    loading,
    error,
  };
}

export default useTransactions;