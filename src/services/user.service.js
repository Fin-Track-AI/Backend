import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  email: { type: String, default: '' },
  name: { type: String, default: 'FinTrack User' },
  avatarUrl: { type: String, default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
  lastLoginAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

export class UserService {
  static async loginOrRegisterUser({ phone, email, name }) {
    const cleanPhone = phone || '9876543210';
    let user = await UserModel.findOne({ phone: cleanPhone });

    if (!user) {
      user = await UserModel.create({
        phone: cleanPhone,
        email: email || `${cleanPhone}@fintrack.app`,
        name: name || `User ${cleanPhone.slice(-4)}`,
        lastLoginAt: new Date(),
      });
    } else {
      user.lastLoginAt = new Date();
      if (name) user.name = name;
      if (email) user.email = email;
      await user.save();
    }

    const token = `jwt_token_${user._id}_${Date.now()}`;
    return {
      user: {
        id: user._id.toString(),
        phone: user.phone,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      token,
    };
  }

  static async getUserByPhone(phone) {
    return await UserModel.findOne({ phone });
  }

  static async getUserById(userId) {
    return await UserModel.findById(userId);
  }
}
