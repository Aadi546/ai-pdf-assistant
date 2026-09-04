import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { toPublicUser } from "./user.mapper";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: RequestUser) {
    const user = await this.usersService.findById(currentUser.userId);
    if (!user) {
      throw new NotFoundException();
    }
    return toPublicUser(user);
  }
}
