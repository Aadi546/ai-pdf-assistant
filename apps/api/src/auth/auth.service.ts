import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { PublicUser, toPublicUser } from "../users/user.mapper";
import { PasswordService } from "./password.service";
import { ACCESS_TOKEN_TTL, AuthTokens, JwtPayload, REFRESH_TOKEN_TTL } from "./auth.types";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string, name?: string): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await this.passwordService.hash(password);
    const user = await this.usersService.create({ email, passwordHash, name });

    return { user: toPublicUser(user), tokens: this.issueTokens(user.id, user.email) };
  }

  async login(email: string, password: string): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await this.usersService.findByEmail(email);
    // Same error for "no such user" and "wrong password" — don't leak which
    // one it was, that turns login into an account-enumeration oracle.
    if (!user || !(await this.passwordService.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return { user: toPublicUser(user), tokens: this.issueTokens(user.id, user.email) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }

    return this.issueTokens(user.id, user.email);
  }

  private issueTokens(userId: string, email: string): AuthTokens {
    const payload: JwtPayload = { sub: userId, email };
    return {
      accessToken: this.jwtService.sign(payload, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
        expiresIn: ACCESS_TOKEN_TTL,
      }),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: REFRESH_TOKEN_TTL,
      }),
    };
  }
}
