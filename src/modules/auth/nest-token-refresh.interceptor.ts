import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class NestTokenRefreshInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        const renewed = req.nestAuth?.refreshedAccessToken;
        if (renewed) {
          res.setHeader('X-Nest-Access-Refreshed', renewed);
          res.setHeader('Access-Control-Expose-Headers', 'X-Nest-Access-Refreshed');
        }
      }),
    );
  }
}
