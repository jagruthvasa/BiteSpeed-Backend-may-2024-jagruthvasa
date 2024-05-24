import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import mysql, { Connection, RowDataPacket } from "mysql2/promise";

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
			host: "localhost",
			user: "root",
			password: "password",
			database: "fluxkart",
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
	let linkPrecedence = null;

	console.log("phoneNumber:", phoneNumber, "email:", email);

	if (!phoneNumber && !email) {
		console.log('1');
		return res.status(400).send("phone number and email cannot be NULL");
	} else if (phoneNumber && email) {
		console.log('2');
		if(await checkIfalreadyExist(email, phoneNumber)) {
			const data = await fetchUsers(email, phoneNumber);
			console.log("final data:", data);
			res.status(200).send(data);
			return
		}
	} else if (email && !phoneNumber) {
		console.log('3');
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
		console.log('4');
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

	// 	let sql = `
	//     INSERT INTO users (phoneNumber, email, linkPrecedence, createdAt)
	//     VALUES (?, ?, ?, NOW())
	//   `;

	// 	try {
	// 		const [result] = await connection.execute(sql, [
	// 			phoneNumber,
	// 			email,
	// 			linkPrecedence,
	// 		]);
	// 		console.log("Inserted user with ID:", result);
	// 		res.status(201).send({ phoneNumber, email, linkPrecedence });

	// 		sql = `
	//       SELECT * FROM users
	//     `;

	// 		const [rows] = await connection.execute(sql);
	// 		console.log("All users:", rows);
	// 	} catch (error) {
	// 		console.error("Error inserting user:", error);
	// 		res.status(500).send("Error inserting user");
	// 	}
});

async function fetchPrimaryContact(email?: string, phoneNumber?: string) {
	try {
		const sql = `
	  SELECT * FROM users WHERE linkPrecedence = ? AND (email = ? OR phoneNumber = ?);
	`;
		const params: any[] = ['primary'];
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
	} else {
		const primaryContact = await fetchPrimaryContact(email);
		const sql = `
	  INSERT INTO users (email, linkedId, linkPrecedence, createdAt, updatedAt)
	  VALUES (?, ?, NOW(), NOW());
	`;

		await connection.execute(sql, [email, primaryContact[0].id, precedenceSecondary,]);

		console.log("new data inserted with linedid");
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
	} else {
		const primaryContact = await fetchPrimaryContact('', phoneNumber);

		
		const sql = `
	  INSERT INTO users (phoneNumber, linkedId, linkPrecedence, createdAt, updatedAt)
	  VALUES (?, ?, ?, NOW(), NOW());
	`;

		await connection.execute(sql, [phoneNumber, primaryContact[0].id, precedenceSecondary,]);

		console.log("new data inserted with linedid");
	}
}


function formatResponse(primaryContact: any, secondaryContacts: any[]) {
	// Create a Set for emails and phoneNumbers to eliminate duplicates
	const emailSet = new Set<string>();
	const phoneNumberSet = new Set<string>();

	// Add primary contact's email and phoneNumber to the sets
	if (primaryContact.email) {
		emailSet.add(primaryContact.email);
	}
	if (primaryContact.phoneNumber) {
		phoneNumberSet.add(primaryContact.phoneNumber);
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
			primaryContactId: primaryContact.id,
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

	let resultSet = formatResponse(getPrimaryContact(primaryData), secondaryData);

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

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
	initializeDatabase();
});
