import { Response } from 'express';
import { client } from '../db/db';
import { IUser } from '../models/User';
import { AuthenticatedRequest } from '../types/express';

const usersCollection = client.db("AgroMart").collection<IUser>('users');

export const getUsers = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const users = await usersCollection.find({}).toArray();
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
