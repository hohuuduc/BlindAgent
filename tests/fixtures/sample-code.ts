// This is a sample code file for testing ast-parser
import fs from 'fs';
import path from 'path';

export interface User {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
}

export type Token = string;

/**
 * Finds user by email
 */
export async function findUser(email: string): Promise<User | null> {
    return { id: '1', name: 'Test', email, isActive: true };
}

/**
 * Login function
 */
export async function login(email: string, pass: string): Promise<Token> {
    const user = await findUser(email);
    if (!user) {
        throw new Error("User not found");
    }
    if (!user.isActive) {
        throw new Error("User not active");
    }

    try {
        const token = "token_" + email;
        return token;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

export class AuthService {
    private users: User[] = [];

    constructor() { }

    public async register(user: User): Promise<boolean> {
        if (this.users.some(u => u.email === user.email)) {
            return false;
        }
        this.users.push(user);
        return true;
    }
}

/**
 * A large monolith structure
 * To test L3 chunking (Signature only)
 */
export function largeMonolith(): void {
    let counter = 0;
    for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
            counter += i;
        } else {
            counter -= i;
        }
        // padding to increase token count
        console.log("doing some heavy work here", i);
        console.log("more heavy work", counter);
    }
    try {
        if (counter > 0) {
            console.log("positive");
        }
    } catch (e) {
        console.error(e);
    }
}
