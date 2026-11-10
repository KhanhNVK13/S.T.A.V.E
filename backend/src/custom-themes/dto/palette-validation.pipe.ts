import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { validatePalettePayload } from './save-custom-theme.dto';

/**
 * Chặn payload palette không hợp lệ ngay ở biên HTTP, trước khi chạm DB.
 *
 * Ném 400 với thông điệp chung chung — không lặp lại giá trị người gửi để
 * không phản chiếu payload độc hại vào log.
 */
@Injectable()
export class PaletteValidationPipe implements PipeTransform {
  transform(value: unknown): unknown {
    const result = validatePalettePayload(value);
    if (!result.ok) {
      throw new BadRequestException(result.reason);
    }
    return value;
  }
}
