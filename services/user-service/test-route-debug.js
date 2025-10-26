const { Test } = require('@nestjs/testing');
const { AppModule } = require('./dist/app.module');

async function debug() {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  
  const server = app.getHttpServer();
  const router = server._events.request._router;
  
  console.log('Registered routes:');
  router.stack.forEach((r) => {
    if (r.route) {
      console.log(`${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
    }
  });
  
  await app.close();
}

debug().catch(console.error);
