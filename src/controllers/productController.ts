import { Request, Response } from 'express';
import { client } from '../db/db';
import { IProduct } from '../models/Product';
import { AuthenticatedRequest } from '../types/express';
import { ObjectId } from 'mongodb';

const productsCollection = client.db("AgroMart").collection<IProduct>('products');


// export const getAllProducts = async (req: Request, res: Response) => {
//   try {
//     const {
//       search,
//       category,
//       sort,
//       minPrice,
//       maxPrice,
//       page = "1",
//       limit = "12",
//     } = req.query;

//     const query: any = {};

//     if (search) {
//       query.name = {
//         $regex: search,
//         $options: "i",
//       };
//     }

//     if (category) {
//       query.category = category;
//     }

//     if (minPrice || maxPrice) {
//       query.price = {};

//       if (minPrice)
//         query.price.$gte = Number(minPrice);

//       if (maxPrice)
//         query.price.$lte = Number(maxPrice);
//     }

//     let sortOption = {};

//     switch (sort) {
//       case "price-asc":
//         sortOption = { price: 1 };
//         break;

//       case "price-desc":
//         sortOption = { price: -1 };
//         break;

//       case "newest":
//         sortOption = { _id: -1 };
//         break;

//       default:
//         sortOption = {};
//     }

//     const skip =
//       (Number(page) - 1) * Number(limit);

//     const products = await productsCollection
//       .find(query)
//       .sort(sortOption)
//       .skip(skip)
//       .limit(Number(limit))
//       .toArray();

//     const total = await productsCollection.countDocuments(query);

//     res.json({
//       products,
//       total,
//       page: Number(page),
//       totalPages: Math.ceil(total / Number(limit)),
//     });

//   } catch (error) {
//     res.status(500).json({
//       message: "Server Error",
//     });
//   }
// };


export const uploadImage = (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  res.status(200).json({ image: `/uploads/${req.file.filename}` });
};


// export const createProduct = async (req: AuthenticatedRequest, res: Response) => {
//   const { name, description, price, quantity, category, image } = req.body;
//   const farmerId = new ObjectId(req.user?._id);

//   if (!name || !description || !price || !quantity || !category) {
//     return res.status(400).json({ message: 'All fields are required' });
//   }

//   try {
//     const newProduct: IProduct = { name, description, price, quantity, category, image, farmerId};
//     const result = await productsCollection.insertOne(newProduct);
//     const insertedProduct = await productsCollection.findOne({ _id: result.insertedId });
//     res.status(201).json(insertedProduct);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// };



// export const getProducts = async (req: Request, res: Response) => {
//   try {
//     const products = await productsCollection.aggregate([
//       {
//         $lookup: {
//           from: 'users',
//           localField: 'farmerId',
//           foreignField: '_id',
//           as: 'farmer'
//         }
//       },
//       {
//         $unwind: '$farmer'
//       },
//       {
//         $project: {
//           name: 1,
//           description: 1,
//           price: 1,
//           quantity: 1,
//           category: 1,
//           image: 1,
//           'farmer.name': 1,
//           'farmer._id': 1
//         }
//       }
//     ]).toArray();
//     res.status(200).json(products);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// };


export const getProducts = async (req: Request, res: Response) => {
  try {
    const products = await productsCollection.find().toArray();

    console.log(products);

    res.status(200).json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};


// export const getSellerProducts = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const products = await productsCollection.find({ farmerId: new ObjectId(req.user?._id) }).toArray();
//     res.status(200).json(products);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// };




// export const getProductById = async (req: Request, res: Response) => {
//   try {
//     const products = await productsCollection.aggregate([
//       {
//         $match: {
//           _id: new ObjectId(String(req.params.id)),
//         }
//       },
//       {
//         $addFields: {
//           farmerObjectId: {
//             $toObjectId: "$farmerId"
//           }
//         }
//       },
//       {
//         $lookup: {
//           from: "users",
//           localField: "farmerObjectId",
//           foreignField: "_id",
//           as: "farmer"
//         }
//       },
//       {
//         $unwind: "$farmer",
//       },
//     ]).toArray();

//     if (products.length === 0) {
//       return res.status(404).json({ message: 'Product not found' });
//     }
//     res.status(200).json(products[0]);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// };




export const getProductById = async (req: Request, res: Response) => {
  const product = await productsCollection.findOne({
    _id: new ObjectId(String(req.params.id)),
  });

  console.log(product);

  res.json(product);
};





// export const updateProduct = async (req: AuthenticatedRequest, res: Response) => {
//   const { name, description, price, quantity, category, image } = req.body;

//   try {
//     const product = await productsCollection.findOne({ _id: new ObjectId(String(req.params.id)) });
//     if (!product) {
//       return res.status(404).json({ message: 'Product not found' });
//     }

//     if (product.farmerId.toString() !== new ObjectId(String(req.params.id)).toString()) {
//       return res.status(401).json({ message: 'User not authorized' });
//     }

//     const updateData: Partial<IProduct> = {};
//     if (name) updateData.name = name;
//     if (description) updateData.description = description;
//     if (price) updateData.price = price;
//     if (quantity) updateData.quantity = quantity;
//     if (category) updateData.category = category;
//     if (image) updateData.image = image;

//     await productsCollection.updateOne({ _id: new ObjectId(String(req.params.id))}, { $set: updateData });

//     const updatedProduct = await productsCollection.findOne({ _id: new ObjectId(String(req.params.id))});
//     res.status(200).json(updatedProduct);
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// };


// export const deleteProduct = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const product = await productsCollection.findOne({ _id: new ObjectId(String(req.params.id))});
//     if (!product) {
//       return res.status(404).json({ message: 'Product not found' });
//     }

//     if (product.farmerId.toString() !== new ObjectId(String(req.params.id)).toString()) {
//       return res.status(401).json({ message: 'User not authorized' });
//     }

//     await productsCollection.deleteOne({ _id: new ObjectId(String(req.params.id))});
//     res.status(200).json({ message: 'Product removed' });
//   } catch (error) {
//     res.status(500).json({ message: 'Server error' });
//   }
// };


export const getAllProducts = async (req: Request, res: Response) => {
  try {
    console.log("Database:", client.db("AgroMart").databaseName);

    const count = await productsCollection.countDocuments();
    console.log("Count:", count);

    const products = await productsCollection.find().toArray();
    console.log("Products:", products);

    res.json({
      products,
      total: count,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

