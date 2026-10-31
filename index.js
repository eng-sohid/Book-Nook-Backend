import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGODB_URI);

let db;
let booksCollection;

async function connectDB() {
  try {
    await client.connect();

    db = client.db("booknook");
    booksCollection = db.collection("books");

    console.log("MongoDB Connected Successfully!");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}

// Test Route
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

// GET All Books
app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch books" });
  }
});

// GET Single Book
app.get("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid Book ID",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    res.status(200).json(book);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch book",
    });
  }
});
// UPDATE Book
app.patch("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid Book ID",
      });
    }

    const updatedData = { ...req.body };

    // Prevent changing these fields through this API
    delete updatedData._id;
    delete updatedData.createdAt;

    if (updatedData.totalCopies !== undefined) {
      updatedData.totalCopies = Number(updatedData.totalCopies);
    }

    if (updatedData.availableCopies !== undefined) {
      updatedData.availableCopies = Number(updatedData.availableCopies);
    }

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    res.status(200).json({
      message: "Book updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update book",
    });
  }
});
// DELETE Book
app.delete("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid Book ID",
      });
    }

    const result = await booksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    res.status(200).json({
      message: "Book deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete book",
    });
  }
});

// POST New Book
app.post("/books", async (req, res) => {
  try {
    const bookData = {
      ...req.body,
      totalCopies: Number(req.body.totalCopies),
      availableCopies: Number(req.body.totalCopies),
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(bookData);

    res.status(201).json({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add book" });
  }
});

// Start Server
async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`BookNook Server running on port ${PORT}`);
  });
}

startServer();
