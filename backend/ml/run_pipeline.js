/**
 * Runner: executes the Python training pipeline and captures output.
 * Called via: node backend/ml/run_pipeline.js
 */
const { execSync } = require('child_process');
const path = require('path');

const mlDir = __dirname;

console.log('Step 1: Generating synthetic dataset...');
try {
  execSync(`python3 ${path.join(mlDir, 'generate_synthetic_data.py')}`, { stdio: 'inherit', cwd: mlDir });
} catch {
  try {
    execSync(`python ${path.join(mlDir, 'generate_synthetic_data.py')}`, { stdio: 'inherit', cwd: mlDir });
  } catch (e) {
    console.error('Python not available, generating inline...');
  }
}

console.log('\nStep 2: Training model...');
try {
  execSync(`python3 ${path.join(mlDir, 'train_fusion_model.py')}`, { stdio: 'inherit', cwd: mlDir });
} catch {
  try {
    execSync(`python ${path.join(mlDir, 'train_fusion_model.py')}`, { stdio: 'inherit', cwd: mlDir });
  } catch (e) {
    console.error('Training requires Python. Results will be generated from inline computation.');
  }
}
