import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequestUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiConfigService } from "./ai-config.service";
import { SetAiConfigDto } from "./dto/set-ai-config.dto";

@ApiTags("ai")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai/config")
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Post()
  async setConfig(@CurrentUser() user: RequestUser, @Body() dto: SetAiConfigDto) {
    await this.aiConfigService.setKey(user.userId, dto.apiKey);
    return { configured: true };
  }

  @Get("status")
  async status(@CurrentUser() user: RequestUser) {
    // Never returns the key itself — only whether one is on file.
    return { configured: await this.aiConfigService.hasKey(user.userId) };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentUser() user: RequestUser) {
    await this.aiConfigService.clearKey(user.userId);
  }
}
