/* eslint-disable */
// @ts-nocheck
// noinspection JSUnusedGlobalSymbols

import { Route as rootRouteImport } from './routes/__root'
import { Route as WhatsappRouteImport } from './routes/whatsapp'
import { Route as WorkflowsRouteImport } from './routes/workflows'
import { Route as LoginRouteImport } from './routes/login'
import { Route as KanbanRouteImport } from './routes/kanban'
import { Route as InboxRouteImport } from './routes/inbox'
import { Route as FunisRouteImport } from './routes/funis'
import { Route as DashboardRouteImport } from './routes/dashboard'
import { Route as ContratosRouteImport } from './routes/contratos'
import { Route as ClientesRouteImport } from './routes/clientes'
import { Route as AgentesRouteImport } from './routes/agentes'
import { Route as IndexRouteImport } from './routes/index'
import { Route as WorkflowsIdRouteImport } from './routes/workflows.$id'
import { Route as ApiPublicZapsignWebhookRouteImport } from './routes/api/public/zapsign-webhook'
import { Route as ApiPublicWorkflowTickRouteImport } from './routes/api/public/workflow-tick'
import { Route as ApiPublicWhatsappWebhookRouteImport } from './routes/api/public/whatsapp-webhook'

const WhatsappRoute = WhatsappRouteImport.update({ id: '/whatsapp', path: '/whatsapp', getParentRoute: () => rootRouteImport } as any)
const WorkflowsRoute = WorkflowsRouteImport.update({ id: '/workflows', path: '/workflows', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const KanbanRoute = KanbanRouteImport.update({ id: '/kanban', path: '/kanban', getParentRoute: () => rootRouteImport } as any)
const InboxRoute = InboxRouteImport.update({ id: '/inbox', path: '/inbox', getParentRoute: () => rootRouteImport } as any)
const FunisRoute = FunisRouteImport.update({ id: '/funis', path: '/funis', getParentRoute: () => rootRouteImport } as any)
const DashboardRoute = DashboardRouteImport.update({ id: '/dashboard', path: '/dashboard', getParentRoute: () => rootRouteImport } as any)
const ContratosRoute = ContratosRouteImport.update({ id: '/contratos', path: '/contratos', getParentRoute: () => rootRouteImport } as any)
const ClientesRoute = ClientesRouteImport.update({ id: '/clientes', path: '/clientes', getParentRoute: () => rootRouteImport } as any)
const AgentesRoute = AgentesRouteImport.update({ id: '/agentes', path: '/agentes', getParentRoute: () => rootRouteImport } as any)
const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const WorkflowsIdRoute = WorkflowsIdRouteImport.update({ id: '/$id', path: '/$id', getParentRoute: () => WorkflowsRoute } as any)
const ApiPublicZapsignWebhookRoute = ApiPublicZapsignWebhookRouteImport.update({ id: '/api/public/zapsign-webhook', path: '/api/public/zapsign-webhook', getParentRoute: () => rootRouteImport } as any)
const ApiPublicWorkflowTickRoute = ApiPublicWorkflowTickRouteImport.update({ id: '/api/public/workflow-tick', path: '/api/public/workflow-tick', getParentRoute: () => rootRouteImport } as any)
const ApiPublicWhatsappWebhookRoute = ApiPublicWhatsappWebhookRouteImport.update({ id: '/api/public/whatsapp-webhook', path: '/api/public/whatsapp-webhook', getParentRoute: () => rootRouteImport } as any)

const WorkflowsRouteWithChildren = WorkflowsRoute._addFileChildren({ WorkflowsIdRoute })

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AgentesRoute: typeof AgentesRoute
  ClientesRoute: typeof ClientesRoute
  ContratosRoute: typeof ContratosRoute
  DashboardRoute: typeof DashboardRoute
  FunisRoute: typeof FunisRoute
  InboxRoute: typeof InboxRoute
  KanbanRoute: typeof KanbanRoute
  LoginRoute: typeof LoginRoute
  WhatsappRoute: typeof WhatsappRoute
  WorkflowsRoute: typeof WorkflowsRouteWithChildren
  ApiPublicWhatsappWebhookRoute: typeof ApiPublicWhatsappWebhookRoute
  ApiPublicWorkflowTickRoute: typeof ApiPublicWorkflowTickRoute
  ApiPublicZapsignWebhookRoute: typeof ApiPublicZapsignWebhookRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/agentes': { id: '/agentes'; path: '/agentes'; fullPath: '/agentes'; preLoaderRoute: typeof AgentesRouteImport; parentRoute: typeof rootRouteImport }
    '/clientes': { id: '/clientes'; path: '/clientes'; fullPath: '/clientes'; preLoaderRoute: typeof ClientesRouteImport; parentRoute: typeof rootRouteImport }
    '/contratos': { id: '/contratos'; path: '/contratos'; fullPath: '/contratos'; preLoaderRoute: typeof ContratosRouteImport; parentRoute: typeof rootRouteImport }
    '/dashboard': { id: '/dashboard'; path: '/dashboard'; fullPath: '/dashboard'; preLoaderRoute: typeof DashboardRouteImport; parentRoute: typeof rootRouteImport }
    '/funis': { id: '/funis'; path: '/funis'; fullPath: '/funis'; preLoaderRoute: typeof FunisRouteImport; parentRoute: typeof rootRouteImport }
    '/inbox': { id: '/inbox'; path: '/inbox'; fullPath: '/inbox'; preLoaderRoute: typeof InboxRouteImport; parentRoute: typeof rootRouteImport }
    '/kanban': { id: '/kanban'; path: '/kanban'; fullPath: '/kanban'; preLoaderRoute: typeof KanbanRouteImport; parentRoute: typeof rootRouteImport }
    '/login': { id: '/login'; path: '/login'; fullPath: '/login'; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport }
    '/whatsapp': { id: '/whatsapp'; path: '/whatsapp'; fullPath: '/whatsapp'; preLoaderRoute: typeof WhatsappRouteImport; parentRoute: typeof rootRouteImport }
    '/workflows': { id: '/workflows'; path: '/workflows'; fullPath: '/workflows'; preLoaderRoute: typeof WorkflowsRouteImport; parentRoute: typeof rootRouteImport }
    '/workflows/$id': { id: '/workflows/$id'; path: '/$id'; fullPath: '/workflows/$id'; preLoaderRoute: typeof WorkflowsIdRouteImport; parentRoute: typeof WorkflowsRouteImport }
    '/api/public/whatsapp-webhook': { id: '/api/public/whatsapp-webhook'; path: '/api/public/whatsapp-webhook'; fullPath: '/api/public/whatsapp-webhook'; preLoaderRoute: typeof ApiPublicWhatsappWebhookRouteImport; parentRoute: typeof rootRouteImport }
    '/api/public/workflow-tick': { id: '/api/public/workflow-tick'; path: '/api/public/workflow-tick'; fullPath: '/api/public/workflow-tick'; preLoaderRoute: typeof ApiPublicWorkflowTickRouteImport; parentRoute: typeof rootRouteImport }
    '/api/public/zapsign-webhook': { id: '/api/public/zapsign-webhook'; path: '/api/public/zapsign-webhook'; fullPath: '/api/public/zapsign-webhook'; preLoaderRoute: typeof ApiPublicZapsignWebhookRouteImport; parentRoute: typeof rootRouteImport }
  }
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByPath
  fullPaths: '/' | '/agentes' | '/clientes' | '/contratos' | '/dashboard' | '/funis' | '/inbox' | '/kanban' | '/login' | '/whatsapp' | '/workflows' | '/workflows/$id' | '/api/public/whatsapp-webhook' | '/api/public/workflow-tick' | '/api/public/zapsign-webhook'
  fileRoutesByTo: FileRoutesByPath
  to: '/' | '/agentes' | '/clientes' | '/contratos' | '/dashboard' | '/funis' | '/inbox' | '/kanban' | '/login' | '/whatsapp' | '/workflows' | '/workflows/$id' | '/api/public/whatsapp-webhook' | '/api/public/workflow-tick' | '/api/public/zapsign-webhook'
  id: '__root__' | '/' | '/agentes' | '/clientes' | '/contratos' | '/dashboard' | '/funis' | '/inbox' | '/kanban' | '/login' | '/whatsapp' | '/workflows' | '/workflows/$id' | '/api/public/whatsapp-webhook' | '/api/public/workflow-tick' | '/api/public/zapsign-webhook'
  fileRoutesById: {
    '__root__': typeof rootRouteImport
    '/': typeof IndexRoute
    '/agentes': typeof AgentesRoute
    '/clientes': typeof ClientesRoute
    '/contratos': typeof ContratosRoute
    '/dashboard': typeof DashboardRoute
    '/funis': typeof FunisRoute
    '/inbox': typeof InboxRoute
    '/kanban': typeof KanbanRoute
    '/login': typeof LoginRoute
    '/whatsapp': typeof WhatsappRoute
    '/workflows': typeof WorkflowsRouteWithChildren
    '/workflows/$id': typeof WorkflowsIdRoute
    '/api/public/whatsapp-webhook': typeof ApiPublicWhatsappWebhookRoute
    '/api/public/workflow-tick': typeof ApiPublicWorkflowTickRoute
    '/api/public/zapsign-webhook': typeof ApiPublicZapsignWebhookRoute
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  AgentesRoute,
  ClientesRoute,
  ContratosRoute,
  DashboardRoute,
  FunisRoute,
  InboxRoute,
  KanbanRoute,
  LoginRoute,
  WhatsappRoute,
  WorkflowsRoute: WorkflowsRouteWithChildren,
  ApiPublicWhatsappWebhookRoute,
  ApiPublicWorkflowTickRoute,
  ApiPublicZapsignWebhookRoute,
}

export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
