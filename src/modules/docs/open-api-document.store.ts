import { Injectable } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger/dist/interfaces';

@Injectable()
export class OpenApiDocumentStore {
  private document: OpenAPIObject | null = null;

  setDocument(doc: OpenAPIObject): void {
    this.document = structuredClone(doc);
  }

  getDocument(): OpenAPIObject {
    if (!this.document) {
      throw new Error('OpenAPI document no inicializado.');
    }
    return structuredClone(this.document);
  }

  isReady(): boolean {
    return this.document !== null;
  }
}
