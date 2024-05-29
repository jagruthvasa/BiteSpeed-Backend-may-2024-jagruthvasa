import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import mysql, { Connection, RowDataPacket } from "mysql2/promise";
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const precedencePrimary = "primary";
const precedenceSecondary = "secondary";

interface Contact extends RowDataPacket {
	id: number;
	phoneNumber: string | null;
	email: string | null;
	linkedId: number | null;
	linkPrecedence: "primary" | "secondary";
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

app.use(bodyParser.json());

let connection: Connection;

async function initializeDatabase() {
	try {
		connection = await mysql.createConnection({
			host: process.env.MYSQL_ADDON_HOST,
			user: process.env.MYSQL_ADDON_USER,
			password: process.env.MYSQL_ADDON_PASSWORD,
			database: process.env.MYSQL_ADDON_DB,
		});
		console.log("Database connected");
	} catch (error) {
		console.error("Error connecting to the database:", error);
		process.exit(1);
	}
}

app.post("/identify", async (req: Request, res: Response) => {
	let phoneNumber = req.body.phoneNumber || null;
	let email = req.body.email || null;

	console.log("phoneNumber:", phoneNumber, "email:", email);

	if (!phoneNumber && !email) {
		return res.status(400).send("phone number and email cannot be NULL");
	} else if (phoneNumber && email) {
		if (!await checkIfalreadyExist(email, phoneNumber)) {
			await fetchByEmailPhoneNum(email, phoneNumber);

		}
		const data = await fetchUsers(email, phoneNumber);
		console.log("final data:", data);
		res.status(200).send(data);
		return

	} else if (email && !phoneNumber) {
		const sql = `
	  SELECT * FROM users WHERE email = ? AND phoneNumber is null;
	`;
		const [rows] = await connection.execute<Contact[]>(sql, [email]);
		if (!rows.length) {
			await fetchByEmail(email);
		}
		const data = await fetchUsers(email, phoneNumber);
		console.log("final data:", data);
		res.status(200).send(data);
		return

	} else if (phoneNumber && !email) {
		const sql = `
	  SELECT * FROM users WHERE phoneNumber = ? AND email is null;
	`;
		const [rows] = await connection.execute<Contact[]>(sql, [phoneNumber]);
		if (!rows.length) {
			await fetchByPhonenumber(phoneNumber);
		}
		const data = await fetchUsers(email, phoneNumber);
		console.log("final data:", data);
		res.status(200).send(data);
		return
	}
});

async function fetchByEmailPhoneNum(email: string, phoneNumber: string) {
	const sql = `SELECT * FROM users WHERE email = ? OR phoneNumber = ?;`;
	const [rows] = await connection.execute<Contact[]>(sql, [email, phoneNumber]);

	if (!rows.length) {
		const sql = `INSERT INTO users (email, phoneNumber, linkPrecedence, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW());`;
		await connection.execute(sql, [email, phoneNumber, precedencePrimary]);
		console.log("new data inserted without adding linkedid");
	} else {
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

			const [rows] = await connection.execute<Contact[]>(sql, params);
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

async function fetchPrimaryContact(email?: string, phoneNumber?: string) {
	try {
		const sql = `
	  SELECT * FROM users WHERE email = ? OR phoneNumber = ? ORDER BY id ASC;
	`;
		const params: any[] = [];
		if (email) {
			params.push(email);
		} else {
			params.push(null);
		}
		if (phoneNumber) {
			params.push(phoneNumber);
		} else {
			params.push(null);
		}
		const [rows] = await connection.execute<Contact[]>(sql, params);

		if (rows.length && rows[0].linkPrecedence != precedencePrimary) {
			const sql = `SELECT * FROM users WHERE id = ?;`
			const [data] = await connection.execute<Contact[]>(sql, [rows[0].linkedId]);
			return data;
		}
		console.log("Executing SQL:", sql);
		console.log("With parameters:", params);
		console.log("rows:", rows);
		return rows;
	} catch (error) {
		console.error("Error fetching primary contact:", error);
		return [];
	}
}

async function fetchSecondaryContact(id: number) {
	const sql = `
	  SELECT * FROM users WHERE linkedId = ?;
	`;
	const [rows] = await connection.execute<Contact[]>(sql, [id]);
	return rows;
}

async function fetchByEmail(email: string) {
	const sql = `
	  SELECT * FROM users WHERE email = ?;
	`;
	const [rows] = await connection.execute<Contact[]>(sql, [email]);

	if (!rows.length) {
		const sql = `
	  INSERT INTO users (email, linkPrecedence, createdAt, updatedAt)
	  VALUES (?, ?, NOW(), NOW());
	`;

		await connection.execute(sql, [email, precedencePrimary,]);

		console.log("new data inserted without adding linkedid");
	}
}

async function fetchByPhonenumber(phoneNumber: string) {
	const sql = `
	  SELECT * FROM users WHERE phoneNumber = ?;
	`;
	const [rows] = await connection.execute<Contact[]>(sql, [phoneNumber]);

	if (!rows.length) {
		const sql = `
	  INSERT INTO users (phoneNumber, linkPrecedence, createdAt, updatedAt)
	  VALUES (?, ?, NOW(), NOW());
	`;

		await connection.execute(sql, [phoneNumber, precedencePrimary,]);

		console.log("new data inserted without adding linkedid");
	}
}

function formatResponse(primaryContact: any[], secondaryContacts: any[]) {
	// Create a Set for emails and phoneNumbers to eliminate duplicates
	const emailSet = new Set<string>();
	const phoneNumberSet = new Set<string>();

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

async function fetchUsers(email?: string, phoneNumber?: string) {
	let primaryData = await fetchPrimaryContact(email, phoneNumber);
	console.log("primaryData:", primaryData);

	let secondaryData = await fetchSecondaryContact(primaryData[0].id);
	console.log("secondaryData:", secondaryData);

	let resultSet = formatResponse(primaryData, secondaryData);

	console.log("resultSet:", resultSet);

	return resultSet;
}

async function checkIfalreadyExist(email?: string, phoneNumber?: string) {
	const sql = `
	  SELECT * FROM users WHERE email = ? AND phoneNumber = ?;
	`;
	const [rows] = await connection.execute<Contact[]>(sql, [email, phoneNumber]);

	console.log("rows:", rows);
	if (rows.length) {
		return true;
	}

	return false;
}

app.get("/", (req: Request, res: Response) => {
	res.send("Server is running");
});

app.listen(process.env.PORT || PORT, () => {
	console.log(`Server is running on port ${PORT}`);
	initializeDatabase();
});
