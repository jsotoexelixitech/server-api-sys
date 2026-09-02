import { Global, Module } from '@nestjs/common';
import { MarketplaceActorStore } from './marketplace-actor.store';

@Global()
@Module({
  providers: [MarketplaceActorStore],
  exports: [MarketplaceActorStore],
})
export class MarketplaceActorModule {}
