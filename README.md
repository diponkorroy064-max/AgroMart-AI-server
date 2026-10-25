# 🌾 AgroMart AI (Server)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22.x-green?style=for-the-badge&logo=node.js" />
  <img src="https://img.shields.io/badge/Express.js-Backend-black?style=for-the-badge&logo=express" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/MongoDB-Database-green?style=for-the-badge&logo=mongodb" />
  <img src="https://img.shields.io/badge/JWT-Authentication-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-success?style=for-the-badge" />
</p>

---

## 📖 Overview

**AgroMart Server** is the backend REST API for the AgroMart platform.

It provides secure authentication, role-based authorization, product management, order management, user management, image uploading, and admin functionalities.

The backend is built with **Node.js**, **Express.js**, **TypeScript**, and **MongoDB**, following a scalable and modular architecture.

---

# 🚀 Features

### 🔐 Authentication

- JWT Authentication
- User Registration
- User Login
- Password Hashing
- Protected Routes

---

### 👥 Role-Based Authorization

Supports multiple roles:

- Admin
- Farmer
- Seller
- Customer

Each role has access to different API endpoints.

---

### 🌱 Product Management

- Add Product
- Update Product
- Delete Product
- Product Details
- Product List
- Seller Products
- Product Search
- Category Filter
- Pagination
- Sorting

---

### 📦 Order Management

- Create Order
- View Orders
- Seller Orders
- Customer Orders
- Order Status Management

---

### 👨‍💼 Admin Features

- Dashboard APIs
- User Management
- Product Management
- Order Monitoring
- Platform Statistics

---

### 🖼 Image Upload

- Multer
- Static Image Serving

---

### 🛡 Security

- JWT Authentication
- Password Hashing
- Role Middleware
- Protected Routes
- Environment Variables

---

# 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| Express.js | Backend Framework |
| TypeScript | Type Safety |
| MongoDB | Database |
| MongoDB Native Driver | Database Access |
| JWT | Authentication |
| bcryptjs | Password Encryption |
| Multer | File Upload |
| dotenv | Environment Variables |
| CORS | Cross-Origin Requests |

---

# 📁 Project Structure

```text
server/
│
├── src/
│   ├── config/
│   │      multer.ts
│   │
│   ├── controllers/
│   │      authController.ts
│   │      productController.ts
│   │      orderController.ts
│   │      adminController.ts
│   │
│   ├── middleware/
│   │      authMiddleware.ts
│   │      roleMiddleware.ts
│   │
│   ├── models/
│   │      User.ts
│   │      Product.ts
│   │      Order.ts
│   │
│   ├── routes/
│   │      auth.ts
│   │      product.ts
│   │      order.ts
│   │      admin.ts
│   │
│   ├── db/
│   │      db.ts
│   │
│   ├── types/
│   │      express.ts
│   │
│   ├── uploads/
│   │
│   └── server.ts
│
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

---

# ⚙ Installation

Clone the repository

```bash
git clone https://github.com/yourusername/agromart.git
```

Move into the server folder

```bash
cd server
```

Install dependencies

```bash
npm install
```

---

# ▶ Running the Server

Development

```bash
npm run dev
```

Production

```bash
npm run build

npm start
```

---

# 🌍 Environment Variables

Create a `.env` file inside the server folder.

```env
PORT=5000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_secret_key

CLIENT_URL=http://localhost:3000
```

---

# 📡 API Endpoints

## Authentication

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/auth/register | Register User |
| POST | /api/auth/login | Login User |

---

## Products

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/products | Get Products |
| GET | /api/products/:id | Get Product Details |
| POST | /api/products | Create Product |
| PUT | /api/products/:id | Update Product |
| DELETE | /api/products/:id | Delete Product |
| GET | /api/products/seller | Seller Products |
| POST | /api/products/upload | Upload Product Image |

---

## Orders

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /api/orders | Create Order |
| GET | /api/orders | Get Orders |
| GET | /api/orders/:id | Order Details |
| PUT | /api/orders/:id | Update Order |
| DELETE | /api/orders/:id | Delete Order |

---

## Admin

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/admin/dashboard | Dashboard Data |
| GET | /api/admin/users | All Users |
| GET | /api/admin/products | All Products |
| GET | /api/admin/orders | All Orders |

---

# 🔒 Authentication

Protected endpoints require a JWT token.

Example:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

---

# 👥 User Roles

## 👨‍💼 Admin

- Manage Users
- Manage Products
- Manage Orders
- Dashboard Statistics

---

## 👨‍🌾 Farmer

- Add Products
- Update Products
- Delete Products
- View Orders
- Manage Profile

---

## 🛒 Seller

- Manage Products
- View Orders
- Dashboard
- Manage Profile

---

## 👤 Customer

- Browse Products
- Product Details
- Place Orders

---

# 📤 Image Upload

Images are uploaded using **Multer**.

Example endpoint:

```
POST /api/products/upload
```

Images are served from:

```
/uploads
```

---

# 📊 Future Improvements

- Stripe Payment Integration
- AI Product Recommendation
- Email Verification
- Password Reset
- Order Tracking
- Notifications
- Product Reviews
- Wishlist
- Inventory Analytics
- Docker Support
- Redis Caching
- Swagger API Documentation

---

# 🧪 Testing

Run tests

```bash
npm test
```

---

# 🚀 Deployment

The server can be deployed on:

- Render
- Railway
- VPS
- DigitalOcean
- AWS EC2
- Azure
- Google Cloud

---

# 🤝 Contributing

1. Fork the repository.

2. Create a new feature branch.

```bash
git checkout -b feature/new-feature
```

3. Commit your changes.

```bash
git commit -m "Add new feature"
```

4. Push your branch.

```bash
git push origin feature/new-feature
```

5. Open a Pull Request.

---

# 📄 License

This project is licensed under the **MIT License**.

---

# 👨‍💻 Author

### Diponkor Roy

🌐 Portfolio  
https://my-first-portfolio-two-eta.vercel.app

💼 LinkedIn  
https://www.linkedin.com/in/diponkorroy21010504

💻 GitHub  
https://github.com/diponkorroy064-max

---

⭐ If you found this project helpful, don't forget to **Star** the repository!
