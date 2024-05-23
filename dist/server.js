"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const app = (0, express_1.default)();
const PORT = 3000;
// Middleware to parse JSON bodies
app.use(body_parser_1.default.json());
// Endpoint for /identify
app.post('/identify', (req, res) => {
    const { email, phoneNumber } = req.body;
    console.log(req.body);
    if (email) {
        res.send(`Identified by email: ${email}`);
    }
    else if (phoneNumber) {
        res.send(`Identified by phone number: ${phoneNumber}`);
    }
    else {
        res.status(400).send('Bad Request: email or phoneNumber field is required');
    }
});
app.get('/', (req, res) => {
    res.send('Server is running');
});
// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
