import * as dotenv from "dotenv";

dotenv.config();

export function validateEnvironment(): void {
   const missingVars: string[] = [];

   const requiredVars = ["OPENAI_API_KEY", "CDP_API_KEY_NAME", "CDP_API_KEY_PRIVATE_KEY"];
   requiredVars.forEach(varName => {
      if (!process.env[varName]) {
         missingVars.push(varName);
      }
   });

   if (missingVars.length > 0) {
      console.error("Error: Required environment variables are not set");
      missingVars.forEach(varName => {
         console.error(`${varName}=your_${varName.toLowerCase()}_here`);
      });
      process.exit(1);
   }
}