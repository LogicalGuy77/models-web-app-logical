import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription, of } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { Router, ActivatedRoute } from '@angular/router';
import { dump } from 'js-yaml';
import {
  NamespaceService,
  ExponentialBackoff,
  Condition,
  Status,
} from 'kubeflow';
import { MWABackendService } from 'src/app/services/backend.service';
import { LLMInferenceServiceK8s } from 'src/app/types/kfserving/llm-inference-service';
import {
  appliedConfigurationNames,
  baseConfigurationNames,
  deriveTopology,
  getLLMInferenceServiceStatus,
  summarizeParallelism,
  summarizeRouter,
  summarizeScaling,
} from 'src/app/shared/llm-inference-service.utils';
import { EventObject } from 'src/app/types/event';

@Component({
  selector: 'app-llm-details',
  templateUrl: './llm-details.component.html',
  styleUrls: ['./llm-details.component.scss'],
})
export class LLMDetailsComponent implements OnInit, OnDestroy {
  public serviceName: string;
  public namespace: string;
  public detailsLoaded = false;
  public loadingErrorMessage = '';
  public llmInferenceService: LLMInferenceServiceK8s;
  public status: Status;
  public events: EventObject[] = [];

  public topology = '';
  public parallelism = '';
  public router = '';
  public scaling = '';
  public conditions: Condition[] = [];
  public baseConfigurations: string[] = [];
  public appliedConfigurations: string[] = [];

  private yamlData = '';

  public get yaml(): string {
    return this.yamlData;
  }

  private poller = new ExponentialBackoff({
    interval: 4000,
    maxInterval: 4001,
    retries: 1,
  });
  private pollingSubscription = new Subscription();
  private paramsSubscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private angularRouter: Router,
    private namespaceService: NamespaceService,
    private backend: MWABackendService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.paramsSubscription = this.route.params.subscribe(params => {
      this.namespaceService.updateSelectedNamespace(params.namespace);

      this.serviceName = params.name;
      this.namespace = params.namespace;

      // Initial load before starting polling
      this.getBackendObjects();

      // Unsubscribe from previous polling before starting a new one
      if (this.pollingSubscription) {
        this.pollingSubscription.unsubscribe();
      }

      this.pollingSubscription = this.poller.start().subscribe(() => {
        this.getBackendObjects();
      });
    });
  }

  ngOnDestroy() {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
    if (this.paramsSubscription) {
      this.paramsSubscription.unsubscribe();
    }
  }

  public navigateBack() {
    this.angularRouter.navigate(['/llm-inference-services']);
  }

  private getBackendObjects() {
    this.backend
      .getLLMInferenceService(this.namespace, this.serviceName)
      .pipe(
        switchMap(llmInferenceService => {
          this.llmInferenceService = llmInferenceService;
          this.parseFetchedObject(llmInferenceService);
          this.detailsLoaded = true;
          this.loadingErrorMessage = '';
          this.cdr.detectChanges();
          return this.backend
            .getLLMInferenceServiceEvents(llmInferenceService)
            .pipe(
              catchError(err => {
                console.warn('Could not load events:', err);
                return of([]);
              }),
            );
        }),
      )
      .subscribe({
        next: events => {
          this.events = events || [];
          this.cdr.detectChanges();
        },
        error: error => {
          console.error('Error loading the LLMInferenceService:', error);
          /*
           * Keep `detailsLoaded` untouched: the template dereferences the
           * fetched object once the details are marked as loaded, so marking
           * a failed initial load as loaded would crash the page. Polling
           * keeps retrying, so a transient failure recovers on a later tick,
           * and data that already rendered stays visible.
           */
          if (!this.detailsLoaded) {
            this.loadingErrorMessage = $localize`Failed to load the LLMInferenceService. Retrying automatically.`;
          }
          this.cdr.detectChanges();
        },
      });
  }

  private parseFetchedObject(llmInferenceService: LLMInferenceServiceK8s) {
    const specification = llmInferenceService.spec;

    this.status = getLLMInferenceServiceStatus(llmInferenceService);
    this.topology = deriveTopology(specification);
    this.parallelism = summarizeParallelism(specification);
    this.router = summarizeRouter(specification);
    this.scaling = summarizeScaling(specification);
    this.conditions = llmInferenceService.status?.conditions || [];
    this.baseConfigurations = baseConfigurationNames(specification);
    this.appliedConfigurations = appliedConfigurationNames(llmInferenceService);
    this.yamlData = dump(llmInferenceService);
  }
}
