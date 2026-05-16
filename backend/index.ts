import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as JWT from "jsonwebtoken";

// 1. Initialize the adapter with your database URL
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});

// 2. Pass the adapter to the PrismaClient constructor
const prisma = new PrismaClient({ adapter });

console.log("ENV:", process.env.DATABASE_URL);
const app = express();
app.use(express.json());

// ... rest of your code stays exactly the same
const STOCKS = [
    {id:"1", title: "Axis Bank", symbol: "AXIS"},
    {id:"2", title: "State Bank of India", symbol: "SBI"},
    {id:"3", title: "HDFC Bank", symbol: "HDFC"},
    {id:"4", title: "ICICI Bank", symbol: "ICICI"},
    {id:"5", title: "Kotak Mahindra Bank", symbol: "KOTAK"},
    {id:"6", title: "Vedanta", symbol: "VEDL"},
    {id:"7", title: "Tata Steel", symbol: "TATASTEEL"},
    {id:"8", title: "Reliance Industries", symbol: "RELIANCE"},
    {id:"9", title: "Larsen & Toubro", symbol: "LT"},
    {id:"10", title: "Maruti Suzuki", symbol: "MARUTI"}
]
const BALANCES: Record<string, Record<string, { available: number; locked: number }>> = {}; // { userId: { INR: {available, locked}, AXIS: {available, locked}, ... } }    
const ORDERS = [];
const FILLS = [];
const ORDERBOOK = {
  AXIS: { bids: {}, asks: {} },
  HDFC: { bids: {}, asks: {} },
  TATA: { bids: {}, asks: {} },
};


// --- Auth ---
app.post("/signup", async (req, res) => {
  // const { username, password } = req.body;
  const {username, password} = req.body;
  // 1. check username not taken
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return res.status(400).json({ error: "Username already taken" });
  }
 
 // use bcrypt
const bcryptHash = await Bun.password.hash(password, {
  algorithm: "bcrypt",
  cost: 4, // number between 4-31
});
  const newUser = await prisma.user.create({
  data: {
    username: username,
    password: bcryptHash
  }
});

  // 2. hash password (bcrypt/argon2)
  // 3. push to USERS
  // 4. init BALANCES[userId] with INR: { available: 0, locked: 0 }
  const userId = newUser.id;
  BALANCES[userId] = { INR: { available: 0, locked: 0 } };
  console.log(BALANCES)
  return res.json({ success: true, message: "User created successfully" , balance: BALANCES[userId]});
  
  

});

app.post("/login", async (req, res) => {
  // 1. find user by username
  const {username, password} = req.body;
  // 1. find user by username
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return res.status(400).json({ error: "Invalid username or password" });
  }
  // 2. compare hashed password
  const isMatch = await Bun.password.verify(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ error: "Invalid username or password" });
  }

  // 3. return JWT / session token
  const jwtSecret = process.env.JWT_SECRET || "dev_secret";
  const token = JWT.sign({ userId: user.id }, jwtSecret, { expiresIn: "7d" });
return res.json({ success: true, token, balance: BALANCES[user.id] });
});
// --- Orders ---
app.post("/order", (req, res) => {
  // body: { userId, side: "BUY"|"SELL", type: "LIMIT"|"MARKET", symbol, price?, qty }
  const { userId, side, type, symbol, price, qty} = req.body;
  // 1. validate input + stock exists
  if(!userId || !side || !type || !symbol || !qty) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!STOCKS.find(s => s.symbol === symbol)) {
    return res.status(400).json({ error: "Invalid stock symbol" });
  }
  // 2. check + lock balance (INR for BUY, stock for SELL)
    if (side === "BUY") {
    const totalCost = price * qty;
    if (!BALANCES[userId] || !BALANCES[userId].INR || BALANCES[userId].INR.available < totalCost) {
      return res.status(400).json({ error: "Insufficient INR balance" });
    }
    BALANCES[userId].INR.available -= totalCost;
    BALANCES[userId].INR.locked += totalCost;
  } else {
    if (!BALANCES[userId] || !BALANCES[userId][symbol] || BALANCES[userId][symbol].available < qty) {
      return res.status(400).json({ error: `Insufficient ${symbol} balance` });
    }
    BALANCES[userId][symbol].available -= qty;
    BALANCES[userId][symbol].locked += qty;

  }
  // 3. run matching engine against opposite side of ORDERBOOK
  
  // 4. write fills to FILLS, update filledQty + status on ORDERS
  // 5. if leftover qty and LIMIT, rest on book; if MARKET, cancel remainder
  // 6. settle balances on each fill (move locked -> other asset's available)
});
   

app.delete("/order/:orderId", (req, res) => {
  // 1. find order, check ownership
  // 2. remove from ORDERBOOK price level
  // 3. unlock remaining reserved balance
  // 4. mark status = CANCELLED
});

app.get("/orders", (req, res) => {
  // query: ?status=OPEN  (or all)
  // return current user's orders
});

// --- Market data ---
app.get("/orderbook/:symbol", (req, res) => {
  // return aggregated depth — totalQty per price level for bids and asks
  // (don't expose individual userIds to other users)
});

app.get("/fills/:symbol", (req, res) => {
  // recent trades for this stock — the "tape"
});

app.get("/stocks", (req, res) => {
  res.json(STOCKS);
});

// --- User data ---
app.get("/balance", (req, res) => {
  // return BALANCES[userId] for the authed user
});


app.listen(3000, () => console.log("CEX running on :3000"));
