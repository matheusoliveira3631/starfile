# Starfile

Compartilhamento de arquivos com links temporários. Os arquivos vão direto do navegador pro S3, a API roda em Lambda e os metadados ficam no DynamoDB.

> Reescrita em andamento. A versão antiga, em Flask, está na tag [`v1-flask`](https://github.com/matheusoliveira3631/starfile/tree/v1-flask).

## Rodando localmente

Precisa de Node 22.

```bash
npm install
npm run dev        # http://localhost:3000/health
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor local com reload |
| `npm test` | testes (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | checagem de tipos |
| `npm run build` | compila para `dist/` |
