/// <reference types="jest" />
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterTestingModule } from '@angular/router/testing';
import { MWABackendService } from 'src/app/services/backend.service';
import { MWANamespaceService } from 'src/app/services/mwa-namespace.service';
import {
  NamespaceService,
  SnackBarService,
  PollerService,
  STATUS_TYPE,
  DashboardState,
} from 'kubeflow';
import { LLMInferenceServiceComponent } from './llm-inference-service.component';
import { of } from 'rxjs';
import { Router } from '@angular/router';

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
    router: { gateway: {}, route: {}, scheduler: {} },
    parallelism: { tensor: 2 },
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

describe('LLMInferenceServiceComponent (Jest)', () => {
  let component: LLMInferenceServiceComponent;
  let fixture: ComponentFixture<LLMInferenceServiceComponent>;
  let mockBackendService: any;
  let mockRouter: any;
  let mockSnackBar: any;
  let mockPoller: any;
  let mockNamespaceService: any;
  let mockMWANamespaceService: any;

  beforeEach(async () => {
    mockBackendService = {
      getLLMInferenceServices: jest
        .fn()
        .mockReturnValue(of([mockLLMInferenceService])),
    };

    mockNamespaceService = {
      getSelectedNamespace: jest.fn().mockReturnValue(of('kubeflow-user')),
      dashboardConnected$: of(DashboardState.Disconnected),
    };

    mockMWANamespaceService = {
      initialize: jest.fn().mockReturnValue(of('')),
      getSelectedNamespace: jest.fn().mockReturnValue(of('kubeflow-user')),
      getNamespaceConfig$: jest.fn().mockReturnValue(
        of({
          namespaces: ['kubeflow-user'],
          allowedNamespaces: ['kubeflow-user'],
          isSingleNamespace: true,
          autoSelectedNamespace: 'kubeflow-user',
        }),
      ),
    };

    mockSnackBar = {
      open: jest.fn(),
    };

    mockPoller = {
      exponential: jest.fn().mockReturnValue(of([mockLLMInferenceService])),
    };

    mockRouter = {
      navigate: jest.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [LLMInferenceServiceComponent],
      imports: [
        HttpClientTestingModule,
        MatSnackBarModule,
        RouterTestingModule,
      ],
      providers: [
        { provide: MWABackendService, useValue: mockBackendService },
        { provide: NamespaceService, useValue: mockNamespaceService },
        { provide: MWANamespaceService, useValue: mockMWANamespaceService },
        { provide: SnackBarService, useValue: mockSnackBar },
        { provide: PollerService, useValue: mockPoller },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LLMInferenceServiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with the selected namespace', () => {
    expect(component.currentNamespace).toBe('kubeflow-user');
  });

  it('should have a toolbar button that navigates to the endpoints page', () => {
    expect(component.buttons.length).toBe(1);
    expect(component.buttons[0].text).toBe('View Endpoints');

    component.buttons[0].fn();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should poll for objects in the selected namespace', () => {
    component.poll('kubeflow-user');
    expect(mockBackendService.getLLMInferenceServices).toHaveBeenCalledWith(
      'kubeflow-user',
    );
  });

  it('should poll again when the namespace changes', () => {
    component.poll('another-namespace');
    expect(mockBackendService.getLLMInferenceServices).toHaveBeenCalledWith(
      'another-namespace',
    );
  });

  it('should process objects into the internal representation', () => {
    component.poll('kubeflow-user');
    fixture.detectChanges();

    expect(component.llmInferenceServices.length).toBe(1);
    const llmInferenceService = component.llmInferenceServices[0];
    expect(llmInferenceService.ui?.status?.phase).toBe(STATUS_TYPE.READY);
    expect(llmInferenceService.ui?.topology).toBe('Single node');
    expect(llmInferenceService.ui?.parallelism).toBe('tensor=2');
    expect(llmInferenceService.ui?.router).toBe(
      'gateway (managed), route (managed), scheduler',
    );
    expect(llmInferenceService.ui?.modelName).toBe('facebook/opt-125m');
    expect(llmInferenceService.ui?.link).toEqual({
      text: 'facebook-opt-125m',
      url: '/llm-details/kubeflow-user/facebook-opt-125m',
    });
  });

  it('should block details navigation for terminating objects', () => {
    const terminating: any = {
      ...mockLLMInferenceService,
      ui: {
        status: { phase: STATUS_TYPE.TERMINATING, state: '', message: '' },
      },
    };
    const mockEvent = {
      stopPropagation: jest.fn(),
      preventDefault: jest.fn(),
    };

    component.reactToAction({
      action: 'name:link',
      data: terminating,
      event: mockEvent,
    } as any);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockSnackBar.open).toHaveBeenCalled();
  });

  it('should track objects by name and creation timestamp', () => {
    const trackByResult = component.llmInferenceServiceTrackByFn(
      0,
      mockLLMInferenceService,
    );
    expect(trackByResult).toContain('facebook-opt-125m');
  });

  it('should unsubscribe on destroy', () => {
    const namespaceUnsubscribe = jest.spyOn(
      component['namespaceSubscription'],
      'unsubscribe',
    );
    const pollingUnsubscribe = jest.spyOn(
      component['pollingSubscription'],
      'unsubscribe',
    );

    component.ngOnDestroy();

    expect(namespaceUnsubscribe).toHaveBeenCalled();
    expect(pollingUnsubscribe).toHaveBeenCalled();
  });
});
