import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import mysql, { Connection } from "mysql2/promise";

const app = express();
const PORT = 3000;

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

app.get("/", (req: Request, res: Response) => {
	res.send("Server is running");
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
	initializeDatabase();
});
