// fix-http-images.js
import mongoose from "mongoose";
import Product from "../src/models/Product.js"; // adjust path

await mongoose.connect(process.env.MONGO_URI);


const products = await Product.find({
  image: { $regex: /^http:\/\// }
});

for (const p of products) {
  p.image = p.image.replace("http://", "https://");
  await p.save();
}

console.log(`Fixed ${products.length} product images`);
process.exit();