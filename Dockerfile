# Build context: repository root
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
ARG GIT_SHA=unknown
ARG BUILD_TIME=
WORKDIR /src
COPY server/Commtrac.Api/ ./Commtrac.Api/
RUN dotnet restore ./Commtrac.Api/Commtrac.Api.csproj
RUN dotnet publish ./Commtrac.Api/Commtrac.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
ARG GIT_SHA=unknown
ARG BUILD_TIME=
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
ENV Build__GitSha=${GIT_SHA}
ENV Build__BuiltAt=${BUILD_TIME}
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Commtrac.Api.dll"]
