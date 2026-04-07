import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from "resend";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, getDoc, Timestamp } from "firebase/firestore";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Firebase
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

let resend: Resend | null = null;

const getResend = () => {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

// API Routes
app.post("/api/send-email", async (req, res) => {
  const { to, subject, html } = req.body;
  
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set. Skipping email.");
    return res.status(200).json({ status: "skipped", message: "API key missing" });
  }

  try {
    const resendClient = getResend();
    const data = await resendClient.emails.send({
      from: "Strawboss Archives <notifications@resend.dev>",
      to,
      subject,
      html,
    });
    res.json({ status: "ok", data });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ status: "error", error: String(error) });
  }
});

// Background Task: Check for items ending soon
const checkEndingSoon = async () => {
  try {
    const now = Timestamp.now();
    const tenMinutesFromNow = new Timestamp(now.seconds + 600, now.nanoseconds);
    
    const q = query(
      collection(db, "items"),
      where("status", "==", "active"),
      where("endTime", "<=", tenMinutesFromNow),
      where("endTime", ">", now),
      where("endingSoonEmailSent", "==", false)
    );

    const snapshot = await getDocs(q);
    
    for (const itemDoc of snapshot.docs) {
      const item = itemDoc.data();
      const itemId = itemDoc.id;

      // Get users watching this item
      // Note: We need to iterate through all users to find who has this item in their watchlist
      // In a real app, you'd have a better index or a separate collection for watchers
      const usersSnapshot = await getDocs(collection(db, "users"));
      
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const user = userDoc.data();
        
        const watchlistDoc = await getDoc(doc(db, `users/${userId}/watchlist`, itemId));
        if (watchlistDoc.exists()) {
          // Send email
          if (user.email && process.env.RESEND_API_KEY) {
            try {
              const resendClient = getResend();
              await resendClient.emails.send({
                from: "Strawboss Archives <notifications@resend.dev>",
                to: user.email,
                subject: `Ending Soon: ${item.title}`,
                html: `<p>The artifact <strong>${item.title}</strong> you are watching is ending in less than 10 minutes!</p>
                       <p>Current Bid: $${item.currentBid || item.price}</p>
                       <a href="${process.env.APP_URL || 'http://localhost:3000'}">View Item</a>`,
              });
            } catch (err) {
              console.error("Failed to send ending soon email:", err);
            }
          }
        }
      }

      // Mark as sent
      await updateDoc(doc(db, "items", itemId), {
        endingSoonEmailSent: true
      });
    }
  } catch (error) {
    console.error("Error in background task:", error);
  }
};

// Run background task every minute
if (process.env.NODE_ENV !== "test") {
  setInterval(checkEndingSoon, 60000);
}

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
