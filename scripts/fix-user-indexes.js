import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';

dotenv.config();

const USERS_COLLECTION = 'users';
const BROKEN_UNIQUE_INDEXES = [
  {
    name: 'phone_1',
    key: { phone: 1 },
  },
];

const matchesKey = (actual = {}, expected = {}) => {
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  if (actualKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((key) => actual[key] === expected[key]);
};

const run = async () => {
  try {
    await connectDB();

    const collection = mongoose.connection.db.collection(USERS_COLLECTION);
    const indexes = await collection.indexes();
    let droppedCount = 0;

    for (const candidate of BROKEN_UNIQUE_INDEXES) {
      const found = indexes.find((index) =>
        index.name === candidate.name &&
        index.unique === true &&
        matchesKey(index.key, candidate.key)
      );

      if (!found) {
        console.log(`Index ${candidate.name} not present or already fixed.`);
        continue;
      }

      await collection.dropIndex(candidate.name);
      droppedCount += 1;
      console.log(`Dropped stale unique index: ${candidate.name}`);
    }

    if (droppedCount === 0) {
      console.log('No stale user indexes required changes.');
    } else {
      console.log(`User index cleanup complete. Dropped ${droppedCount} index(es).`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Failed to fix user indexes:', error.message);
    process.exit(1);
  }
};

run();
