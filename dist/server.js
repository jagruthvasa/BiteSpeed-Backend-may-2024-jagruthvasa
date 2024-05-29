"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const app = (0, express_1.default)();
const PORT = 3000;
const precedencePrimary = "primary";
const precedenceSecondary = "secondary";
app.use(body_parser_1.default.json());
let connection;
async function initializeDatabase() {
    try {
        connection = await promise_1.default.createConnection({
            host: process.env.MYSQL_ADDON_HOST,
            user: process.env.MYSQL_ADDON_USER,
            password: process.env.MYSQL_ADDON_PASSWORD,
            database: process.env.MYSQL_ADDON_DB,
        });
        console.log("Database connected");
    }
    catch (error) {
        console.error("Error connecting to the database:", error);
        process.exit(1);
    }
}
app.post("/identify", async (req, res) => {
    let phoneNumber = req.body.phoneNumber || null;
    let email = req.body.email || null;
    console.log("phoneNumber:", phoneNumber, "email:", email);
    if (!phoneNumber && !email) {
        return res.status(400).send("phone number and email cannot be NULL");
    }
    else if (phoneNumber && email) {
        if (!await checkIfalreadyExist(email, phoneNumber)) {
            await fetchByEmailPhoneNum(email, phoneNumber);
        }
        const data = await fetchUsers(email, phoneNumber);
        console.log("final data:", data);
        res.status(200).send(data);
        return;
    }
    else if (email && !phoneNumber) {
        const sql = `
	  SELECT * FROM users WHERE email = ? AND phoneNumber is null;
	`;
        const [rows] = await connection.execute(sql, [email]);
        if (!rows.length) {
            await fetchByEmail(email);
        }
        const data = await fetchUsers(email, phoneNumber);
        console.log("final data:", data);
        res.status(200).send(data);
        return;
    }
    else if (phoneNumber && !email) {
        const sql = `
	  SELECT * FROM users WHERE phoneNumber = ? AND email is null;
	`;
        const [rows] = await connection.execute(sql, [phoneNumber]);
        if (!rows.length) {
            await fetchByPhonenumber(phoneNumber);
        }
        const data = await fetchUsers(email, phoneNumber);
        console.log("final data:", data);
        res.status(200).send(data);
        return;
    }
});
async function fetchByEmailPhoneNum(email, phoneNumber) {
    const sql = `SELECT * FROM users WHERE email = ? OR phoneNumber = ?;`;
    const [rows] = await connection.execute(sql, [email, phoneNumber]);
    if (!rows.length) {
        const sql = `INSERT INTO users (email, phoneNumber, linkPrecedence, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW());`;
        await connection.execute(sql, [email, phoneNumber, precedencePrimary]);
        console.log("new data inserted without adding linkedid");
    }
    else {
        if (rows.length > 1) {
            const sql = `
				(
					SELECT * FROM users WHERE linkPrecedence = ? AND phoneNumber = ? ORDER BY id ASC LIMIT 1
				)
				UNION
				(
					SELECT * FROM users WHERE linkPrecedence = ? AND email = ? ORDER BY id ASC LIMIT 1
				)
				ORDER BY id ASC;
				`;
            const params = [precedencePrimary, phoneNumber, precedencePrimary, email];
            console.log("Executing SQL:", sql);
            console.log("With parameters:", params);
            const [rows] = await connection.execute(sql, params);
            console.log(rows);
            if (rows.length > 1) {
                const updateSql = `UPDATE users SET linkedId = ?, linkPrecedence = ? WHERE id = ?;`;
                await connection.execute(updateSql, [rows[0].id, precedenceSecondary, rows[1].id]);
            }
            return;
        }
        const primaryContact = await fetchPrimaryContact(email, phoneNumber);
        const sql = `INSERT INTO users (email, phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW());`;
        await connection.execute(sql, [email, phoneNumber, primaryContact[0].id, precedenceSecondary]);
        console.log("new data inserted with linedid");
    }
}
async function fetchPrimaryContact(email, phoneNumber) {
    try {
        const sql = `
	  SELECT * FROM users WHERE email = ? OR phoneNumber = ? ORDER BY id ASC;
	`;
        const params = [];
        if (email) {
            params.push(email);
        }
        else {
            params.push(null);
        }
        if (phoneNumber) {
            params.push(phoneNumber);
        }
        else {
            params.push(null);
        }
        const [rows] = await connection.execute(sql, params);
        if (rows.length && rows[0].linkPrecedence != precedencePrimary) {
            const sql = `SELECT * FROM users WHERE id = ?;`;
            const [data] = await connection.execute(sql, [rows[0].linkedId]);
            return data;
        }
        console.log("Executing SQL:", sql);
        console.log("With parameters:", params);
        console.log("rows:", rows);
        return rows;
    }
    catch (error) {
        console.error("Error fetching primary contact:", error);
        return [];
    }
}
async function fetchSecondaryContact(id) {
    const sql = `
	  SELECT * FROM users WHERE linkedId = ?;
	`;
    const [rows] = await connection.execute(sql, [id]);
    return rows;
}
async function fetchByEmail(email) {
    const sql = `
	  SELECT * FROM users WHERE email = ?;
	`;
    const [rows] = await connection.execute(sql, [email]);
    if (!rows.length) {
        const sql = `
	  INSERT INTO users (email, linkPrecedence, createdAt, updatedAt)
	  VALUES (?, ?, NOW(), NOW());
	`;
        await connection.execute(sql, [email, precedencePrimary,]);
        console.log("new data inserted without adding linkedid");
    }
}
async function fetchByPhonenumber(phoneNumber) {
    const sql = `
	  SELECT * FROM users WHERE phoneNumber = ?;
	`;
    const [rows] = await connection.execute(sql, [phoneNumber]);
    if (!rows.length) {
        const sql = `
	  INSERT INTO users (phoneNumber, linkPrecedence, createdAt, updatedAt)
	  VALUES (?, ?, NOW(), NOW());
	`;
        await connection.execute(sql, [phoneNumber, precedencePrimary,]);
        console.log("new data inserted without adding linkedid");
    }
}
function formatResponse(primaryContact, secondaryContacts) {
    // Create a Set for emails and phoneNumbers to eliminate duplicates
    const emailSet = new Set();
    const phoneNumberSet = new Set();
    // Add primary contact's email and phoneNumber to the sets
    if (primaryContact[0].email) {
        emailSet.add(primaryContact[0].email);
    }
    if (primaryContact[0].phoneNumber) {
        phoneNumberSet.add(primaryContact[0].phoneNumber);
    }
    // Add secondary contacts' emails and phoneNumbers to the sets
    secondaryContacts.forEach(contact => {
        if (contact.email) {
            emailSet.add(contact.email);
        }
        if (contact.phoneNumber) {
            phoneNumberSet.add(contact.phoneNumber);
        }
    });
    // Convert the sets back to arrays
    const emails = Array.from(emailSet);
    const phoneNumbers = Array.from(phoneNumberSet);
    return {
        contact: {
            primaryContactId: primaryContact[0].id,
            emails,
            phoneNumbers,
            secondaryContactIds: secondaryContacts.map(contact => contact.id),
        }
    };
}
async function fetchUsers(email, phoneNumber) {
    let primaryData = await fetchPrimaryContact(email, phoneNumber);
    console.log("primaryData:", primaryData);
    let secondaryData = await fetchSecondaryContact(primaryData[0].id);
    console.log("secondaryData:", secondaryData);
    let resultSet = formatResponse(primaryData, secondaryData);
    console.log("resultSet:", resultSet);
    return resultSet;
}
async function checkIfalreadyExist(email, phoneNumber) {
    const sql = `
	  SELECT * FROM users WHERE email = ? AND phoneNumber = ?;
	`;
    const [rows] = await connection.execute(sql, [email, phoneNumber]);
    console.log("rows:", rows);
    if (rows.length) {
        return true;
    }
    return false;
}
app.get("/", (req, res) => {
    res.send("Server is running");
});
app.listen(process.env.PORT || PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    initializeDatabase();
});
