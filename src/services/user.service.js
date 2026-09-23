import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model.js';
import { config } from '../config/env.js';

export class UserService {
  static formatUserPayload(user) {
    return {
      id: user._id.toString(),
      email: user.email,
      phone: user.phone || '',
      name: user.name || user.fullName || user.email.split('@')[0],
      fullName: user.fullName || user.name || user.email.split('@')[0],
      kycStatus: user.kycStatus || 'PENDING',
      consentStatus: user.consentStatus || 'NONE',
      avatarUrl: user.avatarUrl || '',
      salary: user.salary || 0,
      rent: user.rent || 0,
      bills: user.bills || 0,
      emi: user.emi || 0,
      isSetupComplete: user.isSetupComplete || false,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  static generateToken(user) {
    return jwt.sign(
      { userId: user._id.toString(), email: user.email, phone: user.phone || '' },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
  }

  static async findOrCreateByEmail({ email, name, phone }) {
    const cleanEmail = email.toLowerCase().trim();
    let user = await UserModel.findOne({ email: cleanEmail });

    if (!user) {
      const displayName = name && name.trim().length > 0
        ? name.trim()
        : cleanEmail.split('@')[0];

      const cleanPhone = phone && phone.trim().length > 0
        ? phone.trim()
        : `+91${Date.now().toString().slice(-10)}`;

      user = await UserModel.create({
        email: cleanEmail,
        fullName: displayName,
        name: displayName,
        phone: cleanPhone,
        dob: new Date('2000-01-01'),
        kycStatus: 'PENDING',
        consentStatus: 'NONE',
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      user.lastLoginAt = new Date();
      user.updatedAt = new Date();
      if (name && name.trim().length > 0) {
        user.name = name.trim();
        user.fullName = name.trim();
      }
      if (phone && phone.trim().length > 0) {
        user.phone = phone.trim();
      }
      await user.save();
    }

    const token = this.generateToken(user);

    return {
      user: this.formatUserPayload(user),
      token,
    };
  }

  static async updateFinancialProfile(userId, { name, salary, rent, bills, emi }) {
    const user = await UserModel.findById(userId);
    if (!user) {
      return null;
    }

    if (name) {
      user.name = name;
    }
    if (typeof salary === 'number') {
      user.salary = salary;
    }
    if (typeof rent === 'number') {
      user.rent = rent;
    }
    if (typeof bills === 'number') {
      user.bills = bills;
    }
    if (typeof emi === 'number') {
      user.emi = emi;
    }
    user.isSetupComplete = true;

    await user.save();
    return this.formatUserPayload(user);
  }

  static async getUserById(userId) {
    const user = await UserModel.findById(userId);
    return user ? this.formatUserPayload(user) : null;
  }

  static async getUserByEmail(email) {
    return await UserModel.findOne({ email: email.toLowerCase().trim() });
  }
}
