import { Module } from "@nestjs/common";
import { PgVectorStoreService } from "./pg-vector-store.service";
import { VECTOR_STORE } from "./vector-store.interface";

@Module({
  providers: [{ provide: VECTOR_STORE, useClass: PgVectorStoreService }],
  exports: [VECTOR_STORE],
})
export class RetrievalModule {}
