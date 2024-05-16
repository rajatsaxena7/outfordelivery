const express = require("express");
const admin = require("firebase-admin");
const app = express();
const cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies
//sandesh
// Check if the required environment variable is loaded
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("FIREBASE_SERVICE_ACCOUNT environment variable is missing.");
  process.exit(1); // Exit if the configuration is not available
}

// Initialize Firebase Admin with service account
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("ascii")
);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Default route to indicate that the server is running
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Define the route for sending notifications
app.post("/send-notification", async (req, res) => {
  const { userReference, couponName } = req.body;

  if (!userReference || !couponName) {
    return res
      .status(400)
      .send({ message: "Missing userReference or couponName" });
  }

  try {
    const userDoc = await db.collection("Users").doc(userReference).get();
    if (!userDoc.exists) {
      return res.status(404).send({ message: "User not found" });
    }

    const tokensCollection = await db
      .collection("Users")
      .doc(userReference)
      .collection("fcm_tokens")
      .get();
    if (tokensCollection.empty) {
      return res.status(404).send({ message: "No FCM tokens found for user" });
    }

    const userToken = tokensCollection.docs[0].data().fcm_token;
    if (!userToken) {
      return res
        .status(404)
        .send({ message: "FCM token not found or invalid" });
    }

    const message = {
      notification: {
        title: "Out for Delivery",
        body: `${couponName} is on the way to deliver Your Order.`,
      },
      token: userToken,
    };

    const response = await admin.messaging().send(message);
    res.status(200).send({
      message: "Notification sent successfully",
      response: response,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).send({
      message: "Failed to send notification",
      error: error.message,
    });
  }
});
app.post("/send-common-notification", async (req, res) => {
  const { title, description, imageUrl } = req.body;

  if (!title || !description || !imageUrl) {
    return res
      .status(400)
      .send({ message: "Missing title, description or imageUrl" });
  }

  try {
    const usersCollection = await db.collection("Users").get();
    if (usersCollection.empty) {
      return res.status(404).send({ message: "No users found" });
    }

    let failureCount = 0;
    let successCount = 0;

    for (const userDoc of usersCollection.docs) {
      const tokensSnapshot = await userDoc.ref.collection("fcm_tokens").get();
      if (!tokensSnapshot.empty) {
        const userToken = tokensSnapshot.docs[0].data().fcm_token;
        if (userToken) {
          const message = {
            notification: {
              title: title,
              body: description,
            },
            android: {
              notification: {
                imageUrl: imageUrl, // Android-specific image URL
              },
            },
            apns: {
              payload: {
                aps: {
                  "mutable-content": 1, // Necessary for iOS to handle the image
                },
              },
              fcm_options: {
                image: imageUrl, // APNs-specific image URL
              },
            },
            webpush: {
              headers: {
                image: imageUrl, // Web push-specific image URL
              },
            },
            token: userToken,
          };

          try {
            await admin.messaging().send(message);
            successCount++;
          } catch (error) {
            console.error("Failed to send notification to one user:", error);
            failureCount++;
          }
        }
      }
    }

    res.status(200).send({
      message: "Notifications sent",
      successCount: successCount,
      failureCount: failureCount,
    });
  } catch (error) {
    console.error("Error sending notifications to all:", error);
    res.status(500).send({
      message: "Failed to send notifications to all",
      error: error.message,
    });
  }
});

app.post("/send-notification-to-all", async (req, res) => {
  const { couponName } = req.body;
  if (!couponName) {
    return res.status(400).send({ message: "Missing couponName" });
  }

  try {
    const usersCollection = await db.collection("Users").get();
    if (usersCollection.empty) {
      return res.status(404).send({ message: "No users found" });
    }

    let failureCount = 0;
    let successCount = 0;
    for (const userDoc of usersCollection.docs) {
      const tokensSnapshot = await userDoc.ref.collection("fcm_tokens").get();
      if (!tokensSnapshot.empty) {
        const userToken = tokensSnapshot.docs[0].data().fcm_token;
        if (userToken) {
          const message = {
            notification: {
              title: "Special Offer",
              body: `Hello! Here's a special coupon just for you: ${couponName}`,
            },
            token: userToken,
          };

          try {
            await admin.messaging().send(message);
            successCount++;
          } catch (error) {
            console.error("Failed to send notification to one user:", error);
            failureCount++;
          }
        }
      }
    }

    res.status(200).send({
      message: "Notifications sent",
      successCount: successCount,
      failureCount: failureCount,
    });
  } catch (error) {
    console.error("Error sending notifications to all:", error);
    res.status(500).send({
      message: "Failed to send notifications to all",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
