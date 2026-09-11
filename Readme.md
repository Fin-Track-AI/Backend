# FinTrack Backend Service

A modular, production-ready Node.js & Express REST API architecture for FinTrack.

## 📁 Directory Structure

```text
Backend/
├── .env                  # Local environment variables
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore configuration
├── package.json          # Dependencies & npm scripts
├── Readme.md             # Project documentation
└── src/
    ├── app.js            # Express app configuration & middleware setup
    ├── server.js         # Entry point & server bootstrapping
    ├── config/           # Environment and DB configuration
    │   ├── db.js
    │   └── env.js
    ├── controllers/      # Request handlers / Controllers
    │   ├── auth.controller.js
    │   ├── health.controller.js
    │   └── transaction.controller.js
    ├── middlewares/      # Express custom middlewares (Auth, Errors, Validation)
    │   ├── auth.middleware.js
    │   └── error.middleware.js
    ├── models/           # Data models (Database schemas - Mongoose/Prisma)
    ├── routes/           # Express Route Definitions
    │   ├── index.js
    │   ├── auth.routes.js
    │   ├── health.routes.js
    │   └── transaction.routes.js
    ├── services/         # Business logic layer
    └── utils/            # Shared utilities & response helpers
        ├── apiResponse.js
        └── logger.js
```

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Run Production Server**
   ```bash
   npm start
   ```

## 🔌 API Routes (Base Endpoint: `/api/v1`)

| Method | Endpoint | Description | Auth Required |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Service health check | No |
| POST | `/api/v1/auth/register` | Register user | No |
| POST | `/api/v1/auth/login` | User login | No |
| GET | `/api/v1/auth/profile` | Get current user profile | Yes |
| GET | `/api/v1/transactions` | List all transactions | Yes |
| POST | `/api/v1/transactions` | Create new transaction | Yes |

---

## 🧪 Development / Quality Checks

### Install dependencies

```bash
npm install
```

### Run linting

```bash
npm run lint
```

**ESLint** performs static analysis on the source code to catch bugs, enforce consistent style, and flag potential issues before they reach runtime. The configuration lives in [`eslint.config.js`](./eslint.config.js) and targets all files under `src/`.

### Run tests

```bash
npm test
```

**Jest** is the test runner. Tests live in the `tests/` directory and follow the `*.test.js` naming convention.

**Supertest** is used alongside Jest to make real HTTP requests against the Express app without starting a live server. It imports `src/app.js` directly, keeping tests fast and self-contained.

### Test structure

```text
tests/
└── health.test.js   # Integration test for GET /api/v1/health
```

> **Note:** Because the project uses ES Modules (`"type": "module"`), Jest is run with the `--experimental-vm-modules` flag automatically via the `npm test` script. No Babel configuration is needed.
