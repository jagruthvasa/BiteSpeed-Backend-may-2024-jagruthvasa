import express, { Request, Response } from "express";
import bodyParser from "body-parser";

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.get("/", (req: Request, res: Response) => {
	res.send("Server is running");
});

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
