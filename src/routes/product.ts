import { Router } from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getSellerProducts,
  getSellerApprovedProducts,
  getProductById,
  getAllProducts,
  getProducts,
  uploadImage,
} from "../controllers/productController";
import { protect } from "../middleware/authMiddleware";
import { roleMiddleware } from "../middleware/roleMiddleware";
import upload from "../config/multer";

const router = Router();

// Robust image upload middleware supporting both 'image' and 'file' field names with error catching
const handleProductImageUpload = (req: any, res: any, next: any) => {
  const uploadHandler = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]);

  uploadHandler(req, res, (err: any) => {
    if (err) {
      console.error("Product image upload error:", err);
      return res.status(400).json({ message: err.message || "ছবি আপলোড করতে ব্যর্থ হয়েছে" });
    }

    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        req.file = req.files.image[0];
      } else if (req.files.file && req.files.file[0]) {
        req.file = req.files.file[0];
      }
    }
    next();
  });
};

// Image upload
router.post(
  "/upload",
  protect,
  roleMiddleware("seller", "farmer", "admin"),
  handleProductImageUpload,
  uploadImage
);

// Seller Dashboard APIs (Sidebar item endpoints)
router.post(
  "/",
  protect,
  roleMiddleware("seller", "farmer", "admin"),
  createProduct
);

router.get(
  "/seller",
  protect,
  roleMiddleware("seller", "farmer", "admin"),
  getSellerProducts
);

router.get(
  "/seller/approved",
  protect,
  roleMiddleware("seller", "farmer", "admin"),
  getSellerApprovedProducts
);

// Public APIs
router.get("/all", getProducts);
router.get("/", getAllProducts);

// Single Product Details
router.get("/:id", getProductById);

// Update and Delete Product (Seller or Admin)
router.put(
  "/:id",
  protect,
  roleMiddleware("seller", "farmer", "admin"),
  updateProduct
);

router.delete(
  "/:id",
  protect,
  roleMiddleware("seller", "farmer", "admin"),
  deleteProduct
);

export default router;
