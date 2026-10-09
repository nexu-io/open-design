import http from 'node:http';
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { expect, it } from 'vitest';
import { openDatabase, closeDatabase, insertProject, ensureWorkspaceProject, getProject, getWorkspaceProject, getWorkspaceProjectByProjectId } from '../../src/db.js';
import * as projectFiles from '../../src/projects.js';
import { registerProjectFileRoutes } from '../../src/routes/project/index.js';
import { createSqlitePublicFilePublicationStore } from '../../src/collab/public-file-publication-store.js';
import { createProjectPublicFileStop } from '../../src/collab/project-public-file-stop.js';
import { createPublicFileMutations } from '../../src/collab/public-file-mutations.js';
import { workspaceContextFromDirectoryItem } from '../../src/collab/vela-workspace-context.js';

it.each([false, true])('folder deletion revokes descendants only; failure=%s preserves bytes and durable retry', async fail => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'od-folder-stop-')); const projects=path.join(root,'projects');
 const db=openDatabase(root); let server:http.Server|undefined;
 const scope={resourceTeamId:'workspace',ownerMemberId:'owner',projectId:'project'};
 const files=['folder/index.html','folder/deep/page.html','folder-other/index.html','sibling.html'];
 try {
  insertProject(db,{id:scope.projectId,name:'Folder deletion',createdAt:1,updatedAt:1});
  ensureWorkspaceProject(db,{projectId:scope.projectId,workspaceId:scope.resourceTeamId,visibility:'personal',createdByWorkspaceMemberId:scope.ownerMemberId});
  const store=createSqlitePublicFilePublicationStore(db); const remote=new Set(files);
  for(const filePath of files){await fs.mkdir(path.dirname(path.join(projects,scope.projectId,filePath)),{recursive:true});await fs.writeFile(path.join(projects,scope.projectId,filePath),filePath);store.set({...scope,filePath},{slug:filePath,fileName:filePath,url:null});}
  const stop=createProjectPublicFileStop(store,async key=>({...scope,stop:async()=>{expect(await fs.readFile(path.join(projects,scope.projectId,key.filePath),'utf8')).toBe(key.filePath);if(fail)throw new Error('offline');remote.delete(key.filePath);}}));
  const app=express();app.use(express.json());
  registerProjectFileRoutes(app,{
   db,paths:{PROJECTS_DIR:projects},http:{sendApiError:(res:express.Response,status:number,code:string)=>res.status(status).json({error:code})},
   projectStore:{getProject,getWorkspaceProject,getWorkspaceProjectByProjectId},projectFiles,node:{fs:nodeFs},uploads:{},documents:{},artifacts:{},projectPreviewScopes:{},
   publicFileMutations:createPublicFileMutations(),stopPublicFilesBeforeDelete:(id:string,target:Parameters<typeof stop>[1])=>stop({...scope,projectId:id},target),
   verifyWorkspaceRequestAuthority:async()=>({ok:true,context:workspaceContextFromDirectoryItem({workspaceId:scope.resourceTeamId,workspaceMemberId:scope.ownerMemberId,workspaceName:'W',workspaceType:'personal',role:'owner',memberStatus:'active',lifecycleState:'active'})}),
  } as unknown as Parameters<typeof registerProjectFileRoutes>[1]);
  server=app.listen(0);await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('missing port');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/projects/project/folders`,{method:'DELETE',headers:{'content-type':'application/json','x-od-workspace-id':scope.resourceTeamId,'x-od-workspace-member-id':scope.ownerMemberId},body:JSON.stringify({path:'folder'})});
  expect(response.status).toBe(fail?400:200);
  for(const filePath of files){const kept=fail||!filePath.startsWith('folder/');expect(remote.has(filePath)).toBe(kept);expect(store.get({...scope,filePath})!==null).toBe(kept);if(kept)expect(await fs.readFile(path.join(projects,scope.projectId,filePath),'utf8')).toBe(filePath);else await expect(fs.stat(path.join(projects,scope.projectId,filePath))).rejects.toMatchObject({code:'ENOENT'});}
  expect(store.listStops().map(task=>task.filePath).sort()).toEqual(fail?files.slice(0,2).sort():[]);
 }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));closeDatabase();await fs.rm(root,{recursive:true,force:true});}
});
