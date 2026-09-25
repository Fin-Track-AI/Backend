import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
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
      hasPassword: Boolean(user.password),
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

  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  static async comparePassword(plain, hashed) {
    if (!plain || !hashed) {
      return false;
    }
    return await bcrypt.compare(plain, hashed);
  }

  static async setPassword(userId, newPassword) {
    const user = await UserModel.findById(userId).select('+password');
    if (!user) {
      return null;
    }
    user.password = await this.hashPassword(newPassword);
    user.updatedAt = new Date();
    await user.save();
    return this.formatUserPayload(user);
  }

  static async validateUserPassword(email, plainPassword) {
    const cleanEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: cleanEmail }).select('+password');
    if (!user) {
      return { success: false, reason: 'USER_NOT_FOUND' };
    }
    if (!user.password) {
      return { success: false, reason: 'NO_PASSWORD_SET' };
    }
    const isMatch = await this.comparePassword(plainPassword, user.password);
    if (!isMatch) {
      return { success: false, reason: 'INVALID_CREDENTIALS' };
    }
    user.lastLoginAt = new Date();
    user.updatedAt = new Date();
    await user.save();

    const token = this.generateToken(user);
    return {
      success: true,
      user: this.formatUserPayload(user),
      token,
    };
  }

  static async findOrCreateByEmail({ email, name, phone, password }) {
    const cleanEmail = email.toLowerCase().trim();
    let user = await UserModel.findOne({ email: cleanEmail }).select('+password');

    if (!user) {
      const displayName = name && name.trim().length > 0
        ? name.trim()
        : cleanEmail.split('@')[0];

      const cleanPhone = phone && phone.trim().length > 0
        ? phone.trim()
        : `+91${Date.now().toString().slice(-10)}`;

      const hashedPassword = password ? await this.hashPassword(password) : null;

      user = await UserModel.create({
        email: cleanEmail,
        password: hashedPassword,
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
      if (password && !user.password) {
        user.password = await this.hashPassword(password);
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
    const user = await UserModel.findById(userId).select('+password');
    return user ? this.formatUserPayload(user) : null;
  }

  static async getUserByEmail(email) {
    return await UserModel.findOne({ email: email.toLowerCase().trim() });
  }
}
