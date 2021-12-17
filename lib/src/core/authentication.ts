/**
 * Copyright (c) 2021, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { AsgardeoAuthClient, AuthClientConfig, Store } from "@asgardeo/auth-js";
import { AsgardeoAuthException } from "../exception";
import { NodeTokenResponse } from '../models';
import { MemoryCacheStore } from "../stores";
import cache from 'memory-cache'; // Only for debugging
import { UserSession } from '../session';

export class AsgardeoAuth<T>{

    private _auth: AsgardeoAuthClient<T>;
    private _store: Store;
    private _sessionStore: UserSession;

    //TODO: Add the type here
    constructor(config: AuthClientConfig<T>, store?: Store) {

        //Initialize the default memory cache store if an external store is not passed.
        if (!store) {
            this._store = new MemoryCacheStore();
        } else {
            this._store = store;
        }

        this._auth = new AsgardeoAuthClient(this._store);
        this._sessionStore = new UserSession(this._store);
        this._auth.initialize(config);
    }

    public async getAuthURL(): Promise<string> {

        const authURL = await this._auth.getAuthorizationURL();

        if (authURL) {
            return Promise.resolve(authURL.toString())
        } else {
            return Promise.reject();
        }

    }

    public async requestAccessToken(authorizationCode: string, sessionState: string): Promise<NodeTokenResponse> {

        const access_token = await this._auth.requestAccessToken(authorizationCode, sessionState);
        const sub_from_token = await this._auth.getDecodedIDToken();

        if (!(access_token && sub_from_token)) {
            return Promise.reject(
                new AsgardeoAuthException(
                    "AUTH_CORE-RAT1-NF01", //TODO: Not sure
                    "node-authentication",
                    "requestAccessToken",
                    "Access token or decoded token failed.",
                    "No token endpoint was found in the OIDC provider meta data returned by the well-known endpoint " +
                    "or the token endpoint passed to the SDK is empty."
                )
            )
        }

        //Create a UUID and check if the user has a session already
        const user_uuid = await this._sessionStore.getUUID(sub_from_token.sub);
        const existing_user = await this._sessionStore.getUserSession(user_uuid);

        //Declare the response type
        let response: NodeTokenResponse = { ...access_token, session: "" };

        if (Object.keys(existing_user).length === 0) {
            //Create a new session if the user does not have one already
            const new_user_session = await this._sessionStore.createUserSession(sub_from_token.sub, access_token)
            response = { ...access_token, session: new_user_session };
        } else {
            response = { ...access_token, session: user_uuid };
        }

        //DEBUG
        console.log(cache.keys());

        return Promise.resolve(response);

    }

    public async getIDToken(uuid: string): Promise<string> {

        const user_session = await this._sessionStore.getUserSession(uuid);
        if (Object.keys(user_session).length === 0) {
            return Promise.reject(
                new AsgardeoAuthException(
                    "AUTH_CORE-RAT1-NF01", //TODO: Not sure
                    "node-authentication",
                    "getIDToken",
                    "The user is not logged in.",
                    "No token endpoint was found in the OIDC provider meta data returned by the well-known endpoint " +
                    "or the token endpoint passed to the SDK is empty."
                )
            )
        }
        const idToken = await this._auth.getIDToken();
        if (idToken) {
            return Promise.resolve(idToken)
        } else {
            return Promise.reject(
                new AsgardeoAuthException(
                    "AUTH_CORE-RAT1-NF01", //TODO: Not sure
                    "node-authentication",
                    "getIDToken",
                    "Requesting ID Token Failed",
                    "No token endpoint was found in the OIDC provider meta data returned by the well-known endpoint " +
                    "or the token endpoint passed to the SDK is empty."
                )
            )
        }
    }


    public async signOut(uuid: string): Promise<string> {

        const signOutURL = await this._auth.signOut();
        const destroySession = await this._sessionStore.destroyUserSession(uuid);

        if (!signOutURL || !destroySession) {
            return Promise.reject(
                new AsgardeoAuthException(
                    "AUTH_CORE-RAT1-NF01", //TODO: Not sure
                    "node-authentication",
                    "signout",
                    "Signing out the user failed.",
                    "Could not obtain the signout URL from the server."
                )
            )
        }
        console.log(cache.keys());
        return Promise.resolve(signOutURL);
    }

    public async getSignoutURL(uuid: string): Promise<string> {

        const signOutURL = await this._auth.getSignOutURL();
        const destroySession = await this._sessionStore.destroyUserSession(uuid);

        //DEBUG
        console.log(cache.keys())

        if (!signOutURL || !destroySession) {
            return Promise.reject(
                new AsgardeoAuthException(
                    "AUTH_CORE-RAT1-NF01", //TODO: Not sure
                    "node-authentication",
                    "signout",
                    "Signing out the user failed.",
                    "Could not obtain the signout URL from the server."
                )
            )
        }

        return Promise.resolve(signOutURL);
    }

}