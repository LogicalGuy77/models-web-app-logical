/// <reference types="jest" />
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MatTabsModule } from '@angular/material/tabs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { NamespaceService, STATUS_TYPE } from 'kubeflow';
import { MWABackendService } from 'src/app/services/backend.service';
import { LLMDetailsComponent } from './llm-details.component';
import { of, throwError, Subject } from 'rxjs';

const mockLLMInferenceService: any = {
  kind: 'LLMInferenceService',
  apiVersion: 'serving.kserve.io/v1alpha1',
  metadata: {
    name: 'facebook-opt-125m',
    namespace: 'kubeflow-user',
    creationTimestamp: '2026-01-01T00:00:00Z',
  },
  spec: {
    model: { uri: 'hf://facebook/opt-125m', name: 'facebook/opt-125m' },
    replicas: 2,
    scaling: { minReplicas: 1, maxReplicas: 4, keda: {} },
    router: { ingress: {} },
  },
  status: {
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        lastTransitionTime: '2026-01-01T00:00:00Z',
      },
    ],
  },
};

const mockEvent: any = {
  type: 'Normal',
  reason: 'Created',
  message: 'Created workload',
  lastTimestamp: '2026-01-01T00:00:00Z',
};

describe('LLMDetailsComponent (Jest)', () => {
  let component: LLMDetailsComponent;
  let fixture: ComponentFixture<LLMDetailsComponent>;
  let mockBackendService: any;
  let mockRouter: any;
  let mockNamespaceService: any;
  let routeParams: Subject<any>;

  beforeEach(async () => {
    routeParams = new Subject<any>();

    mockBackendService = {
      getLLMInferenceService: jest
        .fn()
        .mockReturnValue(of(mockLLMInferenceService)),
      getLLMInferenceServiceEvents: jest.fn().mockReturnValue(of([mockEvent])),
    };

    mockNamespaceService = {
      updateSelectedNamespace: jest.fn(),
    };

    mockRouter = {
      navigate: jest.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [LLMDetailsComponent],
      imports: [HttpClientTestingModule, MatTabsModule, NoopAnimationsModule],
      providers: [
        { provide: MWABackendService, useValue: mockBackendService },
        { provide: NamespaceService, useValue: mockNamespaceService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: { params: routeParams.asObservable() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LLMDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const emitRouteParameters = (
    namespace = 'kubeflow-user',
    name = 'facebook-opt-125m',
  ) => {
    routeParams.next({ namespace, name });
    fixture.detectChanges();
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load and parse the object on navigation', () => {
    emitRouteParameters();

    expect(mockNamespaceService.updateSelectedNamespace).toHaveBeenCalledWith(
      'kubeflow-user',
    );
    expect(mockBackendService.getLLMInferenceService).toHaveBeenCalledWith(
      'kubeflow-user',
      'facebook-opt-125m',
    );
    expect(component.detailsLoaded).toBe(true);
    expect(component.loadingErrorMessage).toBe('');
    expect(component.status.phase).toBe(STATUS_TYPE.READY);
    expect(component.topology).toBe('Single node');
    expect(component.router).toBe('ingress (managed)');
    expect(component.scaling).toBe('min=1, max=4, autoscaler=KEDA');
    expect(component.yaml).toContain('facebook-opt-125m');
    expect(component.events).toEqual([mockEvent]);
  });

  it('should render the fetched details', () => {
    emitRouteParameters();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('facebook-opt-125m');
    expect(text).toContain('min=1, max=4, autoscaler=KEDA');
  });

  it('should keep a recoverable state when the initial load fails', () => {
    mockBackendService.getLLMInferenceService.mockReturnValue(
      throwError(() => new Error('backend unavailable')),
    );

    emitRouteParameters();

    expect(component.detailsLoaded).toBe(false);
    expect(component.loadingErrorMessage).toContain('Failed to load');
    expect(fixture.nativeElement.textContent).toContain('Failed to load');
  });

  it('should recover when a later poll succeeds after an initial failure', () => {
    mockBackendService.getLLMInferenceService.mockReturnValue(
      throwError(() => new Error('backend unavailable')),
    );
    emitRouteParameters();
    expect(component.detailsLoaded).toBe(false);

    mockBackendService.getLLMInferenceService.mockReturnValue(
      of(mockLLMInferenceService),
    );
    component['getBackendObjects']();
    fixture.detectChanges();

    expect(component.detailsLoaded).toBe(true);
    expect(component.loadingErrorMessage).toBe('');
  });

  it('should keep showing loaded data when a later poll fails', () => {
    emitRouteParameters();
    expect(component.detailsLoaded).toBe(true);

    mockBackendService.getLLMInferenceService.mockReturnValue(
      throwError(() => new Error('backend unavailable')),
    );
    component['getBackendObjects']();
    fixture.detectChanges();

    expect(component.detailsLoaded).toBe(true);
    expect(component.loadingErrorMessage).toBe('');
  });

  it('should tolerate an events request failure', () => {
    mockBackendService.getLLMInferenceServiceEvents.mockReturnValue(
      throwError(() => new Error('events unavailable')),
    );

    emitRouteParameters();

    expect(component.detailsLoaded).toBe(true);
    expect(component.events).toEqual([]);
  });

  it('should reload when the route parameters change', () => {
    emitRouteParameters();
    emitRouteParameters('kubeflow-user', 'another-service');

    expect(mockNamespaceService.updateSelectedNamespace).toHaveBeenCalledTimes(
      2,
    );
    expect(mockBackendService.getLLMInferenceService).toHaveBeenLastCalledWith(
      'kubeflow-user',
      'another-service',
    );
  });

  it('should navigate back to the list page', () => {
    component.navigateBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/llm-inference-services',
    ]);
  });

  it('should unsubscribe on destroy', () => {
    const pollingUnsubscribe = jest.spyOn(
      component['pollingSubscription'],
      'unsubscribe',
    );
    const parametersUnsubscribe = jest.spyOn(
      component['paramsSubscription'],
      'unsubscribe',
    );

    component.ngOnDestroy();

    expect(pollingUnsubscribe).toHaveBeenCalled();
    expect(parametersUnsubscribe).toHaveBeenCalled();
  });
});
