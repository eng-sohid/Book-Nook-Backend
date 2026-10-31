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
let borrowsCollection;

async function connectDB() {
  try {
    await client.connect();

    db = client.db("booknook");

    booksCollection = db.collection("books");
    borrowsCollection = db.collection("borrows");

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

// UPDATE BOOK
app.patch("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.query.userEmail;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid Book ID",
      });
    }

    if (!userEmail) {
      return res.status(400).json({
        message: "User email is required",
      });
    }

    const updatedData = { ...req.body };

    delete updatedData._id;
    delete updatedData.createdAt;
    delete updatedData.addedByEmail;
    delete updatedData.addedByName;
    delete updatedData.availableCopies;

    if (updatedData.totalCopies !== undefined) {
      const newTotal = Number(updatedData.totalCopies);

      if (!Number.isInteger(newTotal) || newTotal < 1) {
        return res.status(400).json({
          message: "Total copies must be at least 1",
        });
      }

      const currentBook = await booksCollection.findOne({
        _id: new ObjectId(id),
        addedByEmail: userEmail,
      });

      if (!currentBook) {
        return res.status(404).json({
          message: "Book not found or you are not the owner",
        });
      }

      const borrowedCopies =
        currentBook.totalCopies - currentBook.availableCopies;

      if (newTotal < borrowedCopies) {
        return res.status(400).json({
          message: "Total copies cannot be less than borrowed copies",
        });
      }

      updatedData.availableCopies = newTotal - borrowedCopies;
    }

    const result = await booksCollection.updateOne(
      {
        _id: new ObjectId(id),
        addedByEmail: userEmail,
      },
      {
        $set: updatedData,
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Book not found or you are not the owner",
      });
    }

    res.status(200).json({
      message: "Book updated successfully",
    });
  } catch (error) {
    console.error("Update Book Error:", error);

    res.status(500).json({
      message: "Failed to update book",
    });
  }
});

// DELETE BOOK
app.delete("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.query.userEmail;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid Book ID",
      });
    }

    if (!userEmail) {
      return res.status(400).json({
        message: "User email is required",
      });
    }

    const result = await booksCollection.deleteOne({
      _id: new ObjectId(id),
      addedByEmail: userEmail,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Book not found or you are not the owner",
      });
    }

    res.status(200).json({
      message: "Book deleted successfully",
    });
  } catch (error) {
    console.error("Delete Book Error:", error);

    res.status(500).json({
      message: "Failed to delete book",
    });
  }
});

// BORROW Book
app.post("/borrows", async (req, res) => {
  const { bookId, userEmail, userName, borrowDate, returnDate } = req.body;

  if (!ObjectId.isValid(bookId)) {
    return res.status(400).json({
      message: "Invalid Book ID",
    });
  }

  if (!userEmail || !userName || !borrowDate || !returnDate) {
    return res.status(400).json({
      message: "All borrow information is required",
    });
  }

  const session = client.startSession();

  try {
    let borrowResult;

    await session.withTransaction(async () => {
      const book = await booksCollection.findOne(
        { _id: new ObjectId(bookId) },
        { session },
      );

      if (!book) {
        throw new Error("BOOK_NOT_FOUND");
      }

      const existingBorrow = await borrowsCollection.findOne(
        {
          bookId,
          userEmail,
          status: "borrowed",
        },
        { session },
      );

      if (existingBorrow) {
        throw new Error("ALREADY_BORROWED");
      }

      if (book.availableCopies <= 0) {
        throw new Error("NO_COPIES");
      }

      const updateResult = await booksCollection.updateOne(
        {
          _id: new ObjectId(bookId),
          availableCopies: { $gt: 0 },
        },
        {
          $inc: { availableCopies: -1 },
        },
        { session },
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error("NO_COPIES");
      }

      const borrowData = {
        bookId,
        bookTitle: book.title,
        bookImage: book.image,
        userEmail,
        userName,
        borrowDate: new Date(borrowDate),
        returnDate: new Date(returnDate),
        status: "borrowed",
        createdAt: new Date(),
      };

      borrowResult = await borrowsCollection.insertOne(borrowData, {
        session,
      });
    });

    // Check updated book copies after transaction
    const updatedBook = await booksCollection.findOne({
      _id: new ObjectId(bookId),
    });

    console.log("--------------------------------");
    console.log("Book ID:", bookId);
    console.log("Available Copies Before Borrow:", updatedBook.totalCopies);
    console.log("Available Copies After Borrow:", updatedBook.availableCopies);
    console.log("--------------------------------");

    res.status(201).json({
      message: "Book borrowed successfully",
      insertedId: borrowResult.insertedId,
      availableCopies: updatedBook.availableCopies,
    });
  } catch (error) {
    if (error.message === "BOOK_NOT_FOUND") {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    if (error.message === "ALREADY_BORROWED") {
      return res.status(409).json({
        message: "You have already borrowed this book",
      });
    }

    if (error.message === "NO_COPIES") {
      return res.status(400).json({
        message: "No available copies",
      });
    }

    console.error("Borrow Error:", error);

    res.status(500).json({
      message: "Failed to borrow book",
    });
  } finally {
    await session.endSession();
  }
});
// GET My Borrows
app.get("/borrows", async (req, res) => {
  try {
    const { userEmail } = req.query;

    if (!userEmail) {
      return res.status(400).json({
        message: "User email is required",
      });
    }

    const borrows = await borrowsCollection
      .find({ userEmail: userEmail.toString() })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(borrows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch borrowed books",
    });
  }
});
// RETURN Book
app.delete("/borrows/:id", async (req, res) => {
  const id = req.params.id;
  const session = client.startSession();

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "Invalid Borrow ID",
    });
  }

  try {
    await session.withTransaction(async () => {
      const borrow = await borrowsCollection.findOne(
        { _id: new ObjectId(id), status: "borrowed" },
        { session },
      );

      if (!borrow) {
        throw new Error("BORROW_NOT_FOUND");
      }

      const deleteResult = await borrowsCollection.deleteOne(
        { _id: new ObjectId(id), status: "borrowed" },
        { session },
      );

      if (deleteResult.deletedCount === 0) {
        throw new Error("BORROW_NOT_FOUND");
      }

      await booksCollection.updateOne(
        { _id: new ObjectId(borrow.bookId) },
        { $inc: { availableCopies: 1 } },
        { session },
      );
    });

    res.status(200).json({
      message: "Book returned successfully",
    });
  } catch (error) {
    if (error.message === "BORROW_NOT_FOUND") {
      return res.status(404).json({
        message: "Borrow record not found or already returned",
      });
    }

    console.error(error);

    res.status(500).json({
      message: "Failed to return book",
    });
  } finally {
    await session.endSession();
  }
});
// POST New Book

app.post("/books", async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
      addedByName,
      addedByEmail,
    } = req.body;

    if (
      !title ||
      !author ||
      !category ||
      !image ||
      !description ||
      !addedByName ||
      !addedByEmail ||
      !Number.isInteger(Number(totalCopies)) ||
      Number(totalCopies) < 1
    ) {
      return res.status(400).json({
        message: "Please provide all required book information",
      });
    }

    const bookData = {
      title: title.trim(),
      author: author.trim(),
      category,
      image: image.trim(),
      description: description.trim(),
      totalCopies: Number(totalCopies),
      availableCopies: Number(totalCopies),
      addedByName,
      addedByEmail,
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(bookData);

    res.status(201).json({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Add Book Error:", error);

    res.status(500).json({
      message: "Failed to add book",
    });
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
