import {
    addDoc,
    collection,
    serverTimestamp,
} from "firebase/firestore";

import { db } from "./firebase";


/* =========================================================
   HELPERS
   ========================================================= */

function getDateKeys() {
    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    return {
        dateKey: `${year}-${month}-${day}`,

        monthKey:
            `${year}-${month}`,

        yearKey:
            String(year),
    };
}


/* =========================================================
   INVOICE NUMBER
   ========================================================= */

function generateInvoiceNumber() {
    const now = new Date();

    const year = now.getFullYear();

    const month = String(
        now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        now.getDate()
    ).padStart(2, "0");

    const time =
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        String(now.getSeconds()).padStart(2, "0");

    const random =
        Math.floor(
            100 + Math.random() * 900
        );

    return `INV-${year}${month}${day}-${time}-${random}`;
}


/* =========================================================
   CREATE TRANSACTION
   ========================================================= */

export async function createTransaction(data) {

    if (!data) {
        throw new Error(
            "Transaction data is missing."
        );
    }


    if (!data.attendantId) {
        throw new Error(
            "Attendant ID is missing."
        );
    }


    if (
        !Array.isArray(data.items) ||
        data.items.length === 0
    ) {
        throw new Error(
            "Transaction must contain at least one item."
        );
    }


    if (!data.paymentMethod) {
        throw new Error(
            "Payment method is missing."
        );
    }


    /* =====================================================
       CALCULATE TOTALS
       ===================================================== */

    let subtotal = 0;

    let totalCost = 0;

    const items = data.items.map((item) => {

        const quantity =
            Number(item.quantity) || 0;

        const unitPrice =
            Number(item.unitPrice) || 0;

        const costPrice =
            Number(item.costPrice) || 0;

        const itemTotal =
            quantity * unitPrice;

        const itemCost =
            quantity * costPrice;

        subtotal += itemTotal;

        totalCost += itemCost;

        return {
            serviceId:
                item.serviceId || "",

            serviceName:
                item.serviceName || "Service",

            quantity,

            unitPrice,

            costPrice,

            total:
                itemTotal,

            cost:
                itemCost,
        };
    });


    const total =
        Number(subtotal.toFixed(2));


    const profit =
        Number(
            (total - totalCost).toFixed(2)
        );


    if (total <= 0) {
        throw new Error(
            "Transaction total must be greater than zero."
        );
    }


    /* =====================================================
       DATE KEYS
       ===================================================== */

    const {
        dateKey,
        monthKey,
        yearKey,
    } = getDateKeys();


    /* =====================================================
       TRANSACTION DOCUMENT
       ===================================================== */

    const transaction = {

        /* Invoice */
        invoiceNo:
            generateInvoiceNumber(),


        /* Staff */
        attendantId:
            data.attendantId,

        attendantName:
            data.attendantName || "Attendant",

        createdByRole:
            "attendant",


        /* Items */
        items,


        /* Financial */
        subtotal,

        discount:
            Number(data.discount) || 0,

        amount:
            total,

        totalCost,

        profit,


        /* Payment */
        paymentMethod:
            data.paymentMethod,


        /* Optional customer */
        customerId:
            data.customerId || null,

        customerName:
            data.customerName || "",

        customerPhone:
            data.customerPhone || "",


        /* Notes */
        notes:
            data.notes || "",


        /* Date indexes */
        dateKey,

        monthKey,

        yearKey,


        /* Status */
        status:
            "completed",


        /* Firebase timestamp */
        createdAt:
            serverTimestamp(),
    };


    console.log(
        "CREATE TRANSACTION:",
        transaction
    );


    /* =====================================================
       FIRESTORE
       ===================================================== */

    const transactionRef =
        await addDoc(
            collection(
                db,
                "transactions"
            ),
            transaction
        );


    console.log(
        "TRANSACTION CREATED:",
        transactionRef.id
    );


    return {
        id:
            transactionRef.id,

        ...transaction,
    };
}