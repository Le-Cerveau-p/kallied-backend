import { Body, Controller, Get, Post } from '@nestjs/common';
import { CompanyService } from './company.service';
import { ContactMessageDto } from './dto/contact-message.dto';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get('profile')
  getProfile() {
    return this.companyService.getProfile();
  }

  @Post('contact')
  sendContactMessage(@Body() body: ContactMessageDto) {
    return this.companyService.sendContactMessage(body);
  }
}
