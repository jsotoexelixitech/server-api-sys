import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MonedaService } from './moneda.service';
import { BcvRateRepository } from './repositories/bcv-rate.repository';

describe('MonedaService', () => {
  let service: MonedaService;
  const repo = {
    findPtasamonUsdForDate: jest.fn(),
    findPtasamonUsdVigente: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonedaService,
        { provide: BcvRateRepository, useValue: repo },
      ],
    }).compile();
    service = module.get(MonedaService);
  });

  it('devuelve tasa histórica cuando existe en mavamonedas', async () => {
    repo.findPtasamonUsdForDate.mockResolvedValue({
      ptasa: 848.5458,
      source: 'mavamonedas',
    });
    const row = await service.getTasaBcvUsdForDate('2026-09-18');
    expect(row.ptasa).toBe(848.5458);
    expect(row.fecha).toBe('2026-09-18');
  });

  it('lanza BadRequestException si la fecha es inválida', async () => {
    await expect(service.getTasaBcvUsdForDate('18-09-2026')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lanza NotFoundException si no hay tasa para la fecha', async () => {
    repo.findPtasamonUsdForDate.mockResolvedValue(null);
    await expect(service.getTasaBcvUsdForDate('2020-01-01')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
