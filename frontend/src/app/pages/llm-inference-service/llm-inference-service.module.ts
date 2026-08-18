import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { LLMInferenceServiceComponent } from './llm-inference-service.component';
import { LLMDetailsComponent } from './llm-details/llm-details.component';
import { KubeflowModule } from 'kubeflow';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  declarations: [LLMInferenceServiceComponent, LLMDetailsComponent],
  imports: [CommonModule, KubeflowModule, MatTabsModule, SharedModule],
  exports: [LLMInferenceServiceComponent, LLMDetailsComponent],
})
export class LLMInferenceServiceModule {}
