import { useEffect, useMemo, useState } from "react";

import {
  Plus,
  Search,
  Download,
  ArrowLeftRight,
  User,
  Phone,
  IndianRupee,
  WalletCards,
  X,
  CheckCircle2,
  TrendingUp,
  ReceiptText,
  Loader2,
} from "lucide-react";

import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatCurrency } from "../../utils/currency";

import "./MoneyTransfer.css";


/* =========================================================
   MONEY TRANSFER
   ========================================================= */

export default function MoneyTransfer() {

  const {
    user,
    profile,
    role,
  } = useAuth();


  /* =====================================================
     STATE
     ===================================================== */

  const [search, setSearch] =
    useState("");

  const [showForm, setShowForm] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [transfers, setTransfers] =
    useState([]);

  const [error, setError] =
    useState(null);


  const [form, setForm] = useState({
    customerName: "",
    mobile: "",
    transferAmount: "",
    serviceCharge: "",
    paymentMethod: "cash",
  });


  /* =====================================================
     LOAD FIREBASE TRANSFERS
     ===================================================== */

  useEffect(() => {

    const transfersRef =
      collection(
        db,
        "moneyTransfers"
      );


    /*
      IMPORTANT:

      Do NOT use:

      query(
        transfersRef,
        orderBy("createdAt", "desc")
      )

      here.

      We load the complete collection and
      sort it locally. This prevents records
      from disappearing when an older Firebase
      document does not contain createdAt.
    */

    const unsubscribe =
      onSnapshot(
        transfersRef,

        (snapshot) => {

          const data =
            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...doc.data(),
              })
            );


          /* =========================================
             SORT NEWEST FIRST
             ========================================= */

          data.sort(
            (a, b) => {

              const getTimestamp =
                (item) => {

                  if (
                    !item?.createdAt
                  ) {
                    return 0;
                  }


                  try {

                    /*
                      Firestore Timestamp
                    */

                    if (
                      typeof item.createdAt.toDate ===
                      "function"
                    ) {

                      return item.createdAt
                        .toDate()
                        .getTime();

                    }


                    /*
                      Normal JavaScript date
                    */

                    const date =
                      new Date(
                        item.createdAt
                      );

                    const time =
                      date.getTime();

                    return Number.isNaN(
                      time
                    )
                      ? 0
                      : time;

                  } catch {

                    return 0;

                  }

                };


              return (
                getTimestamp(b) -
                getTimestamp(a)
              );

            }
          );


          console.log(
            "Money transfers loaded:",
            data
          );


          setTransfers(
            data
          );

          setLoading(
            false
          );

          setError(
            null
          );

        },

        (firebaseError) => {

          console.error(
            "Money transfer listener error:",
            firebaseError
          );


          setError(
            firebaseError
          );

          setLoading(
            false
          );

          setTransfers(
            []
          );

        }
      );


    return () =>
      unsubscribe();

  }, []);


  /* =====================================================
     FORM CHANGE
     ===================================================== */

  function handleChange(
    event
  ) {

    const {
      name,
      value,
    } = event.target;


    setForm(
      (current) => ({
        ...current,
        [name]: value,
      })
    );

  }


  /* =====================================================
     RESET FORM
     ===================================================== */

  function resetForm() {

    setForm({
      customerName: "",
      mobile: "",
      transferAmount: "",
      serviceCharge: "",
      paymentMethod: "cash",
    });

  }


  /* =====================================================
     CALCULATED VALUES
     ===================================================== */

  const transferAmount =
    Number(
      form.transferAmount
    ) || 0;


  const serviceCharge =
    Number(
      form.serviceCharge
    ) || 0;


  const customerPays =
    transferAmount +
    serviceCharge;


  /* =====================================================
     SAVE TRANSFER
     ===================================================== */

  async function saveTransfer(
    event
  ) {

    event.preventDefault();


    if (saving) {
      return;
    }


    /* =========================================
       LOGIN CHECK
       ========================================= */

    if (!user?.uid) {

      alert(
        "Your login session has expired. Please login again."
      );

      return;

    }


    /* =========================================
       CUSTOMER NAME
       ========================================= */

    if (
      !form.customerName.trim()
    ) {

      alert(
        "Please enter customer name."
      );

      return;

    }


    /* =========================================
       MOBILE
       ========================================= */

    if (
      !form.mobile.trim()
    ) {

      alert(
        "Please enter customer mobile number."
      );

      return;

    }


    /* =========================================
       TRANSFER AMOUNT
       ========================================= */

    if (
      transferAmount <= 0
    ) {

      alert(
        "Please enter a valid transfer amount."
      );

      return;

    }


    /* =========================================
       SERVICE CHARGE
       ========================================= */

    if (
      serviceCharge < 0
    ) {

      alert(
        "Service charge cannot be negative."
      );

      return;

    }


    setSaving(
      true
    );


    try {

      /* =========================================
         CURRENT DATE
         ========================================= */

      const now =
        new Date();


      const dateKey =
        now
          .toISOString()
          .slice(
            0,
            10
          );


      const monthKey =
        now
          .toISOString()
          .slice(
            0,
            7
          );


      const yearKey =
        now
          .getFullYear()
          .toString();


      /* =========================================
         TRANSFER DATA
         ========================================= */

      const transferData = {

        /* Customer */

        customerName:
          form.customerName.trim(),

        mobile:
          form.mobile.trim(),


        /* Money */

        transferAmount:
          transferAmount,

        serviceCharge:
          serviceCharge,

        customerPays:
          customerPays,


        /* Payment */

        paymentMethod:
          form.paymentMethod,


        /* Staff */

        attendantId:
          user.uid,

        attendantName:
          profile?.name ||
          user.displayName ||
          user.email ||
          "Attendant",


        /* Status */

        status:
          "completed",


        /* Date */

        createdAt:
          serverTimestamp(),

        dateKey:
          dateKey,

        monthKey:
          monthKey,

        yearKey:
          yearKey,
      };


      console.log(
        "Saving money transfer:",
        transferData
      );


      /* =========================================
         SAVE TO FIREBASE
         ========================================= */

      const docRef =
        await addDoc(
          collection(
            db,
            "moneyTransfers"
          ),
          transferData
        );


      console.log(
        "Money transfer saved successfully. Document ID:",
        docRef.id
      );


      alert(
        "Money transfer saved successfully."
      );


      /* =========================================
         RESET
         ========================================= */

      resetForm();

      setShowForm(
        false
      );


    } catch (
      firebaseError
    ) {

      console.error(
        "Money transfer save failed:",
        firebaseError
      );


      alert(
        `Unable to save money transfer.\n\n${
          firebaseError?.message ||
          "Unknown Firebase error"
        }`
      );


    } finally {

      setSaving(
        false
      );

    }

  }


  /* =====================================================
     FILTER
     ===================================================== */

  const filteredTransfers =
    useMemo(
      () => {

        const keyword =
          search
            .trim()
            .toLowerCase();


        if (!keyword) {

          return transfers;

        }


        return transfers.filter(
          (item) =>

            String(
              item.customerName ||
              ""
            )
              .toLowerCase()
              .includes(
                keyword
              ) ||

            String(
              item.mobile ||
              ""
            )
              .toLowerCase()
              .includes(
                keyword
              ) ||

            String(
              item.attendantName ||
              ""
            )
              .toLowerCase()
              .includes(
                keyword
              )

        );

      },
      [
        transfers,
        search,
      ]
    );


  /* =====================================================
     TODAY STATS
     ===================================================== */

  const todayKey =
    new Date()
      .toISOString()
      .slice(
        0,
        10
      );


  const todayTransfers =
    transfers.filter(
      (item) =>
        item.dateKey ===
        todayKey
    );


  const todayTransferAmount =
    todayTransfers.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.transferAmount ||
          0
        ),
      0
    );


  const todayProfit =
    todayTransfers.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.serviceCharge ||
          0
        ),
      0
    );


  const todayCount =
    todayTransfers.length;


  /* =====================================================
     DATE FORMAT
     ===================================================== */

  function formatDate(
    timestamp
  ) {

    if (
      !timestamp
    ) {

      return "Just now";

    }


    try {

      const date =
        timestamp?.toDate
          ? timestamp.toDate()
          : new Date(
              timestamp
            );


      return date.toLocaleString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      );

    } catch {

      return "Unknown date";

    }

  }


  /* =====================================================
     EXPORT CSV
     ===================================================== */

  function exportTransfers() {

    if (
      !filteredTransfers.length
    ) {

      alert(
        "No money transfer records to export."
      );

      return;

    }


    const headers = [

      "Customer Name",

      "Mobile",

      "Transfer Amount",

      "Service Charge",

      "Customer Pays",

      "Payment Method",

      "Attendant",

      "Date",

    ];


    const rows =
      filteredTransfers.map(
        (item) => [

          item.customerName ||
          "",

          item.mobile ||
          "",

          item.transferAmount ||
          0,

          item.serviceCharge ||
          0,

          item.customerPays ||
          0,

          item.paymentMethod ||
          "",

          item.attendantName ||
          "",

          formatDate(
            item.createdAt
          ),

        ]
      );


    const csv = [
      headers,
      ...rows,
    ]
      .map(
        (row) =>
          row
            .map(
              (value) =>
                `"${String(
                  value
                ).replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(",")
      )
      .join("\n");


    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8;",
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const link =
      document.createElement(
        "a"
      );


    link.href =
      url;


    link.download =
      `money-transfers-${todayKey}.csv`;


    document.body.appendChild(
      link
    );


    link.click();


    document.body.removeChild(
      link
    );


    URL.revokeObjectURL(
      url
    );

  }


  /* =====================================================
     UI
     ===================================================== */

  return (

    <div className="money-transfer-page">


      {/* =============================================
          HEADER
      ============================================= */}

      <div className="money-header">

        <div className="money-header-left">

          <div className="money-icon-main">

            <ArrowLeftRight
              size={24}
            />

          </div>


          <div>

            <div className="money-eyebrow">
              MONEY SERVICES
            </div>


            <h1>
              Money Transfer
            </h1>


            <p>
              Record customer transfers
              and track your service earnings.
            </p>

          </div>

        </div>


        <button
          type="button"
          className="money-add-btn"
          onClick={() =>
            setShowForm(true)
          }
        >

          <Plus size={17} />

          New Transfer

        </button>

      </div>


      {/* =============================================
          STATS
      ============================================= */}

      <div className="money-stats">


        {/* TODAY COUNT */}

        <div className="money-stat-card">

          <div className="money-stat-icon blue">

            <ArrowLeftRight
              size={19}
            />

          </div>


          <div>

            <span>
              Today's Transfers
            </span>


            <strong>
              {todayCount}
            </strong>

          </div>

        </div>


        {/* TRANSFER AMOUNT */}

        <div className="money-stat-card">

          <div className="money-stat-icon purple">

            <IndianRupee
              size={19}
            />

          </div>


          <div>

            <span>
              Transfer Amount
            </span>


            <strong>
              {formatCurrency(
                todayTransferAmount
              )}
            </strong>

          </div>

        </div>


        {/* PROFIT */}

        <div className="money-stat-card">

          <div className="money-stat-icon green">

            <TrendingUp
              size={19}
            />

          </div>


          <div>

            <span>
              Today's Profit
            </span>


            <strong>
              {formatCurrency(
                todayProfit
              )}
            </strong>

          </div>

        </div>


        {/* TOTAL */}

        <div className="money-stat-card">

          <div className="money-stat-icon orange">

            <ReceiptText
              size={19}
            />

          </div>


          <div>

            <span>
              Total Records
            </span>


            <strong>
              {transfers.length}
            </strong>

          </div>

        </div>

      </div>


      {/* =============================================
          RECORDS
      ============================================= */}

      <section className="money-records-panel">


        <div className="money-panel-header">

          <div>

            <div className="money-section-label">
              TRANSACTION HISTORY
            </div>


            <h2>
              Money Transfers
            </h2>


            <p>
              View and search previous
              customer transfer records.
            </p>

          </div>


          <button
            type="button"
            className="money-export-btn"
            onClick={
              exportTransfers
            }
          >

            <Download size={15} />

            Export

          </button>

        </div>


        {/* SEARCH */}

        <div className="money-toolbar">

          <div className="money-search">

            <Search size={17} />


            <input
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search customer, mobile or attendant..."
            />


            {search && (

              <button
                type="button"
                onClick={() =>
                  setSearch("")
                }
              >

                <X size={15} />

              </button>

            )}

          </div>


          <div className="money-result-count">

            {filteredTransfers.length}
            {" "}
            records

          </div>

        </div>


        {/* =========================================
            LOADING
        ========================================= */}

        {loading && (

          <div className="money-state">

            <Loader2
              className="spin"
              size={28}
            />


            <strong>
              Loading transfers...
            </strong>

          </div>

        )}


        {/* =========================================
            ERROR
        ========================================= */}

        {!loading &&
          error && (

            <div className="money-state error">

              <div className="state-circle">
                !
              </div>


              <strong>
                Unable to load transfers
              </strong>


              <p>
                {error.message}
              </p>

            </div>

          )}


        {/* =========================================
            EMPTY
        ========================================= */}

        {!loading &&
          !error &&
          !filteredTransfers.length && (

            <div className="money-empty">

              <div className="empty-money-icon">

                <ArrowLeftRight
                  size={25}
                />

              </div>


              <h3>
                No money transfers yet
              </h3>


              <p>
                Create your first customer
                money transfer to see it here.
              </p>


              <button
                type="button"
                onClick={() =>
                  setShowForm(true)
                }
              >

                <Plus size={16} />

                Create Transfer

              </button>

            </div>

          )}


        {/* =========================================
            TABLE
        ========================================= */}

        {!loading &&
          !error &&
          filteredTransfers.length > 0 && (

            <div className="money-table-wrap">

              <table className="money-table">

                <thead>

                  <tr>

                    <th>
                      Customer
                    </th>

                    <th>
                      Transfer
                    </th>

                    <th>
                      Service Charge
                    </th>

                    <th>
                      Customer Pays
                    </th>

                    <th>
                      Payment
                    </th>

                    <th>
                      Attendant
                    </th>

                    <th>
                      Date
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {filteredTransfers.map(
                    (item) => (

                      <tr
                        key={
                          item.id
                        }
                      >

                        {/* CUSTOMER */}

                        <td>

                          <div className="customer-cell">

                            <div className="customer-avatar">

                              {(
                                item.customerName ||
                                "C"
                              )
                                .charAt(0)
                                .toUpperCase()}

                            </div>


                            <div>

                              <strong>
                                {
                                  item.customerName
                                }
                              </strong>


                              <span>
                                {
                                  item.mobile
                                }
                              </span>

                            </div>

                          </div>

                        </td>


                        {/* TRANSFER */}

                        <td>

                          <strong className="amount-text">

                            {formatCurrency(
                              item.transferAmount ||
                              0
                            )}

                          </strong>

                        </td>


                        {/* SERVICE CHARGE */}

                        <td>

                          <strong className="profit-text">

                            +

                            {formatCurrency(
                              item.serviceCharge ||
                              0
                            )}

                          </strong>

                        </td>


                        {/* CUSTOMER PAYS */}

                        <td>

                          <strong>

                            {formatCurrency(
                              item.customerPays ||
                              0
                            )}

                          </strong>

                        </td>


                        {/* PAYMENT */}

                        <td>

                          <span className="payment-badge">

                            {String(
                              item.paymentMethod ||
                              "cash"
                            ).toUpperCase()}

                          </span>

                        </td>


                        {/* ATTENDANT */}

                        <td>

                          <span className="attendant-name">

                            {
                              item.attendantName
                            }

                          </span>

                        </td>


                        {/* DATE */}

                        <td>

                          <span className="date-text">

                            {formatDate(
                              item.createdAt
                            )}

                          </span>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

      </section>


      {/* =============================================
          NEW TRANSFER MODAL
      ============================================= */}

      {showForm && (

        <div
          className="money-modal-backdrop"

          onMouseDown={(e) => {

            if (
              e.target ===
              e.currentTarget
            ) {

              setShowForm(
                false
              );

            }

          }}
        >

          <div className="money-modal">


            {/* MODAL HEADER */}

            <div className="money-modal-header">

              <div>

                <div className="money-modal-icon">

                  <ArrowLeftRight
                    size={21}
                  />

                </div>


                <div>

                  <div className="money-section-label">
                    NEW TRANSACTION
                  </div>


                  <h2>
                    Money Transfer
                  </h2>

                </div>

              </div>


              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setShowForm(
                    false
                  )
                }
              >

                <X size={18} />

              </button>

            </div>


            {/* FORM */}

            <form
              onSubmit={
                saveTransfer
              }
            >

              <div className="money-form-grid">


                {/* CUSTOMER NAME */}

                <div className="money-field">

                  <label>
                    Customer Name
                  </label>


                  <div className="money-input">

                    <User size={16} />


                    <input
                      name="customerName"
                      value={
                        form.customerName
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter customer name"
                      autoComplete="off"
                    />

                  </div>

                </div>


                {/* MOBILE */}

                <div className="money-field">

                  <label>
                    Mobile Number
                  </label>


                  <div className="money-input">

                    <Phone size={16} />


                    <input
                      name="mobile"
                      value={
                        form.mobile
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="Enter mobile number"
                      inputMode="numeric"
                      maxLength={15}
                      autoComplete="off"
                    />

                  </div>

                </div>


                {/* TRANSFER AMOUNT */}

                <div className="money-field">

                  <label>
                    Transfer Amount
                  </label>


                  <div className="money-input money-input-large">

                    <IndianRupee
                      size={17}
                    />


                    <input
                      name="transferAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        form.transferAmount
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="0.00"
                    />

                  </div>


                  <small>
                    Amount being sent
                    to the customer
                  </small>

                </div>


                {/* SERVICE CHARGE */}

                <div className="money-field">

                  <label>
                    Service Charge / Profit
                  </label>


                  <div className="money-input money-input-large profit-input">

                    <TrendingUp
                      size={17}
                    />


                    <input
                      name="serviceCharge"
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        form.serviceCharge
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="0.00"
                    />

                  </div>


                  <small>
                    Your shop's earning
                    from this transfer
                  </small>

                </div>

              </div>


              {/* PAYMENT */}

              <div className="payment-form-section">

                <label>
                  Payment Method
                </label>


                <div className="payment-method-grid">

                  {[
                    {
                      id: "cash",
                      label: "Cash",
                    },
                    {
                      id: "upi",
                      label: "UPI",
                    },
                    {
                      id: "card",
                      label: "Card",
                    },
                  ].map(
                    (
                      method
                    ) => (

                      <button
                        type="button"
                        key={
                          method.id
                        }
                        className={
                          form.paymentMethod ===
                          method.id
                            ? "payment-method active"
                            : "payment-method"
                        }
                        onClick={() =>
                          setForm(
                            (
                              current
                            ) => ({
                              ...current,
                              paymentMethod:
                                method.id,
                            })
                          )
                        }
                      >

                        <WalletCards
                          size={17}
                        />

                        {
                          method.label
                        }

                      </button>

                    )
                  )}

                </div>

              </div>


              {/* CALCULATION */}

              <div className="transfer-calculation">


                <div>

                  <span>
                    Transfer Amount
                  </span>


                  <strong>

                    {formatCurrency(
                      transferAmount
                    )}

                  </strong>

                </div>


                <div>

                  <span>
                    Service Charge
                  </span>


                  <strong className="calculation-profit">

                    +

                    {formatCurrency(
                      serviceCharge
                    )}

                  </strong>

                </div>


                <div className="calculation-total">

                  <span>
                    Customer Pays
                  </span>


                  <strong>

                    {formatCurrency(
                      customerPays
                    )}

                  </strong>

                </div>

              </div>


              {/* ACTIONS */}

              <div className="money-modal-actions">

                <button
                  type="button"
                  className="cancel-money-btn"
                  onClick={() =>
                    setShowForm(
                      false
                    )
                  }
                  disabled={
                    saving
                  }
                >

                  Cancel

                </button>


                <button
                  type="submit"
                  className="save-money-btn"
                  disabled={
                    saving
                  }
                >

                  {saving ? (

                    <>

                      <Loader2
                        size={17}
                        className="spin"
                      />

                      Saving...

                    </>

                  ) : (

                    <>

                      <CheckCircle2
                        size={17}
                      />

                      Save Transfer

                    </>

                  )}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>

  );

}