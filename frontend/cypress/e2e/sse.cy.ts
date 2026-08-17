describe('Models Web App - Server-Sent Events (SSE) Tests', () => {
  const mockInferenceService = {
    apiVersion: 'serving.kserve.io/v1beta1',
    kind: 'InferenceService',
    metadata: {
      name: 'test-model',
      namespace: 'kubeflow-user',
      creationTimestamp: '2024-03-09T10:00:00Z',
      resourceVersion: '12345',
      uid: 'test-uid-123',
      ownerReferences: [],
    },
    spec: {
      predictor: {
        sklearn: {
          storageUri: 'gs://test-bucket/model',
          runtimeVersion: '0.24.1',
          protocolVersion: 'v1',
        },
      },
    },
    status: {
      conditions: [
        {
          type: 'Ready',
          status: 'True',
          lastTransitionTime: '2024-03-09T10:05:00Z',
        },
      ],
      url: 'http://test-model.kubeflow-user.example.com',
      components: {
        predictor: {
          latestCreatedRevision: 'test-model-predictor-v1',
          ready: 'True',
        },
      },
    },
  };

  const secondInferenceService = {
    ...mockInferenceService,
    metadata: {
      ...mockInferenceService.metadata,
      name: 'second-model',
      uid: 'test-uid-456',
    },
    status: {
      ...mockInferenceService.status,
      url: 'http://second-model.kubeflow-user.example.com',
    },
  };

  beforeEach(() => {
    cy.on('uncaught:exception', err => {
      if (err.message.includes('403') || err.message.includes('Forbidden')) {
        return false;
      }
      return true;
    });

    cy.intercept('GET', '/api/config', {
      statusCode: 200,
      body: {
        grafanaPrefix: '/grafana',
        grafanaCpuMemoryDb: 'db/knative-serving-revision-cpu-and-memory-usage',
        grafanaHttpRequestsDb: 'db/knative-serving-revision-http-requests',
      },
    }).as('config');

    cy.intercept('GET', '/api/config/namespaces', {
      statusCode: 200,
      body: { namespaces: ['kubeflow-user'] },
    }).as('namespaces');
  });

  it('should load the index page over SSE', () => {
    cy.mockSse({ inferenceServices: [mockInferenceService] });
    cy.visit('/');
    cy.wait('@config');
    cy.wait('@namespaces');

    cy.contains('Endpoints').should('be.visible');
    cy.get('lib-table').should('contain', 'test-model');
  });

  it('should display InferenceServices from the SSE INITIAL snapshot', () => {
    cy.mockSse({ inferenceServices: [mockInferenceService] });
    cy.visit('/');
    cy.wait('@config');
    cy.wait('@namespaces');

    cy.get('lib-table').should('be.visible');
    cy.get('lib-table').should('contain', 'test-model');
  });

  it('should display multiple InferenceServices from SSE', () => {
    cy.mockSse({
      inferenceServices: [mockInferenceService, secondInferenceService],
    });
    cy.visit('/');
    cy.wait('@config');
    cy.wait('@namespaces');

    cy.get('lib-table').should('contain', 'test-model');
    cy.get('lib-table').should('contain', 'second-model');
  });

  it('should display empty state when SSE returns no services', () => {
    cy.mockSse({ inferenceServices: [] });
    cy.visit('/');
    cy.wait('@config');
    cy.wait('@namespaces');

    cy.get('lib-table').within(() => {
      cy.contains('No rows to display').should('be.visible');
    });
  });

  it('should append a row when SSE emits ADDED', () => {
    cy.mockSse({ inferenceServices: [mockInferenceService] });
    cy.visit('/');
    cy.wait('@config');
    cy.wait('@namespaces');
    cy.get('lib-table').should('contain', 'test-model');

    cy.emitSse({ type: 'ADDED', object: secondInferenceService });

    cy.get('lib-table').should('contain', 'second-model');
  });

  it('should remove a row when SSE emits DELETED', () => {
    cy.mockSse({ inferenceServices: [mockInferenceService] });
    cy.visit('/');
    cy.wait('@config');
    cy.wait('@namespaces');
    cy.get('lib-table').should('contain', 'test-model');

    cy.emitSse({ type: 'DELETED', object: mockInferenceService });

    cy.get('lib-table').within(() => {
      cy.contains('No rows to display').should('be.visible');
    });
  });

  it('should watch the selected namespace over SSE', () => {
    cy.mockSse({ inferenceServices: [mockInferenceService] });
    cy.visit('/');
    cy.wait('@config');
    cy.wait('@namespaces');
    cy.get('lib-table').should('contain', 'test-model');

    cy.window().should(win => {
      const sources = (
        win as Window & { __cypressSseSources?: Array<{ url: string }> }
      ).__cypressSseSources;
      expect(
        sources?.some(source =>
          /\/namespaces\/kubeflow-user\/inferenceservices\/?$/.test(source.url),
        ),
        'SSE list watch for kubeflow-user',
      ).to.equal(true);
    });
  });
});
